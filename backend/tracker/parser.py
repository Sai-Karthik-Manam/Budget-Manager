"""
Bank statement parser.

Extracts (date, description, amount, type, category) tuples from raw
text pulled out of SBI / APGB / generic bank statements.

Key design decision: amounts are only ever matched if they're written
with a decimal point (e.g. "44.00", "1,435.62"). Every bank statement
we support prints monetary values with two decimal places, while
reference numbers, UPI IDs, phone numbers, account numbers, and years
are always printed as plain integers. Requiring a decimal point is a
far more reliable signal than filtering by digit count, and it means
we never need to special-case "10+ digit reference numbers" or "years
between 1990-2050" again.
"""

import re
from datetime import date, datetime
from typing import NamedTuple, Optional


# ---------------------------------------------------------------------------
# Categorization
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    'Food': ['zomato', 'swiggy', 'hotel', 'restaurant', 'cafe', 'bakery',
              'food', 'eats', 'canteen', 'hungerbox'],
    'Shopping': ['amazon', 'flipkart', 'myntra', 'zara', 'mall', 'reliance',
                 'dmart', 'supermarket', 'groceries', 'mart', 'meesho',
                 'paytm mall'],
    'Utilities': ['electricity', 'water', 'gas', 'broadband', 'airtel',
                  'jio', 'recharge', 'mobile', 'dth', 'bill', 'insurance'],
    'Rent': ['rent', 'landlord', 'pg', 'hostel fee', 'maintenance'],
    'Travel': ['uber', 'ola', 'rapido', 'irctc', 'train', 'flight',
               'petrol', 'diesel', 'fuel', 'metro', 'auto', 'bus'],
    'Salary': ['salary', 'allowance', 'stipend', 'bonus', 'wage'],
    'Investment': ['mutual fund', 'zerodha', 'groww', 'stock', 'share',
                   'dividend', 'sip', 'fd', 'rd'],
    'Self Transfer': ['self', 'transfer to self', 'own account',
                       'transfer from self'],
    'Entertainment': ['netflix', 'prime', 'spotify', 'movie', 'cinema',
                       'bookmyshow', 'game', 'pub'],
}

INCOME_ONLY_KEYWORDS = {
    'Salary': ['salary', 'stipend'],
    'Interest': ['interest'],
    'Refund/Cashback': ['cashback', 'refund'],
    'Investment': ['dividend'],
}


def auto_categorize(description: str, trans_type: str) -> str:
    """Guess a spending/income category from the transaction description."""
    desc_lower = description.lower()

    if trans_type == 'INCOME':
        for category, keywords in INCOME_ONLY_KEYWORDS.items():
            if any(keyword in desc_lower for keyword in keywords):
                return category

    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in desc_lower for keyword in keywords):
            return category

    return 'Other'


# ---------------------------------------------------------------------------
# Amount extraction
# ---------------------------------------------------------------------------

# Matches numbers written with a decimal point, e.g. 44.00 / 1,435.62
# Deliberately does NOT match plain integers, so reference numbers, UPI
# IDs, phone numbers, and years are never mistaken for amounts.
AMOUNT_PATTERN = re.compile(r'\b\d{1,3}(?:,\d{3})*\.\d{1,2}\b|\b\d+\.\d{1,2}\b')


def find_amounts(text: str) -> list[float]:
    """Return every decimal-formatted monetary amount found in `text`, in order."""
    amounts = []
    for raw in AMOUNT_PATTERN.findall(text):
        value = float(raw.replace(',', ''))
        if value > 0.0:
            amounts.append(value)
    return amounts


def strip_amounts(text: str) -> str:
    """Remove monetary amounts from text, leaving a clean description."""
    cleaned = AMOUNT_PATTERN.sub('', text)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    cleaned = re.sub(r'^[-/,:.\s]+|[-/,:.\s]+$', '', cleaned).strip()
    return cleaned


# ---------------------------------------------------------------------------
# Date extraction
# ---------------------------------------------------------------------------

DATE_PATTERN = re.compile(r'\d{1,2}[-/.\s](?:[a-zA-Z]{3}|\d{1,2})[-/.\s]\d{2,4}')

DATE_FORMATS = (
    '%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y',
    '%d %b %Y', '%d-%b-%Y', '%d-%b-%y',
    '%d/%m/%y', '%d-%m-%y',
)


def parse_date_token(raw: str) -> Optional[date]:
    """Try each known date format against a matched date token."""
    normalized = re.sub(r'\s+', ' ', raw).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Transaction type (income vs expense)
# ---------------------------------------------------------------------------

CREDIT_KEYWORDS = ('upi/c/', 'cr', 'credit', 'deposit', 'refund', 'int.pd', 'by ')
DEBIT_KEYWORDS = ('upi/d/', 'dr', 'debit', 'withdrawal', 'chrg', 'to ')


def determine_type(context: str) -> str:
    """Decide INCOME vs EXPENSE from surrounding transaction text."""
    lower = context.lower()

    if 'upi/c/' in lower:
        return 'INCOME'
    if 'upi/d/' in lower:
        return 'EXPENSE'

    if any(keyword in lower for keyword in CREDIT_KEYWORDS):
        return 'INCOME'
    if any(keyword in lower for keyword in DEBIT_KEYWORDS):
        return 'EXPENSE'

    return 'EXPENSE'


# ---------------------------------------------------------------------------
# Line filtering
# ---------------------------------------------------------------------------

HEADER_FOOTER_MARKERS = (
    'tran particulars', 'withdrawals', 'deposits',
    'statement of account', 'generated on', 'page no',
)


def is_header_or_footer(line: str) -> bool:
    lower = line.lower()
    return any(marker in lower for marker in HEADER_FOOTER_MARKERS)


# ---------------------------------------------------------------------------
# Core parsing
# ---------------------------------------------------------------------------

class RawTransaction(NamedTuple):
    txn_date: date
    description_parts: list[str]
    amount: Optional[float]
    trans_type: str


def parse_statement_text(text: str, account_type: str) -> list[dict]:
    """
    Parse raw statement text into a list of transaction dicts:
    {date, description, amount, type, category}.

    Handles statements where a transaction's amount appears on the same
    line as its date, or on a following line (common when a PDF wraps
    a long description across multiple lines).
    """
    transactions: list[RawTransaction] = []
    current: Optional[RawTransaction] = None

    for raw_line in text.split('\n'):
        line = raw_line.strip()
        if not line or is_header_or_footer(line):
            continue

        date_match = DATE_PATTERN.search(line)

        if date_match:
            # Flush the transaction we were building, if it's complete.
            if current is not None and current.amount is not None:
                transactions.append(current)

            parsed_date = parse_date_token(date_match.group(0))
            if parsed_date is None:
                current = None
                continue

            remainder = line.replace(date_match.group(0), '', 1).strip()
            amounts = find_amounts(remainder)

            current = RawTransaction(
                txn_date=parsed_date,
                description_parts=[remainder],
                amount=amounts[0] if amounts else None,
                trans_type=determine_type(remainder) if amounts else 'EXPENSE',
            )

        elif current is not None:
            current.description_parts.append(line)

            if current.amount is None:
                amounts = find_amounts(line)
                if amounts:
                    full_context = ' '.join(current.description_parts)
                    current = current._replace(
                        amount=amounts[0],
                        trans_type=determine_type(full_context),
                    )

    if current is not None and current.amount is not None:
        transactions.append(current)

    return [_finalize(txn) for txn in transactions]


def _finalize(txn: RawTransaction) -> dict:
    """Turn a RawTransaction into the plain dict shape the API returns."""
    description = strip_amounts(' '.join(txn.description_parts)) or 'Bank Transaction'
    category = auto_categorize(description, txn.trans_type)

    return {
        'date': txn.txn_date.strftime('%Y-%m-%d'),
        'description': description,
        'amount': txn.amount,
        'type': txn.trans_type,
        'category': category,
    }


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(pdf_file, password: Optional[str] = None) -> str:
    """Decrypt (if needed) and extract all text from a PDF file-like object."""
    import pypdf

    try:
        reader = pypdf.PdfReader(pdf_file)

        if reader.is_encrypted:
            if not password:
                raise ValueError("PDF is encrypted. Please provide a password.")
            if reader.decrypt(password) == 0:
                raise ValueError("Incorrect password for PDF.")

        try:
            _ = len(reader.pages)
        except Exception:
            raise ValueError("Incorrect password for PDF.")

        return '\n'.join(
            page.extract_text() or '' for page in reader.pages
        )

    except Exception as exc:
        message = str(exc).lower()
        if 'password' in message or 'decrypt' in message or 'encrypted' in message:
            raise ValueError("Incorrect password for PDF.")
        raise ValueError(f"Failed to process PDF: {exc}")