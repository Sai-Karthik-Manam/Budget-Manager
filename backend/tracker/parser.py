import re
from datetime import datetime

# Simple category rules based on description keywords
CATEGORY_KEYWORDS = {
    'Food': ['zomato', 'swiggy', 'hotel', 'restaurant', 'cafe', 'bakery', 'food', 'eats', 'canteen'],
    'Shopping': ['amazon', 'flipkart', 'myntra', 'zara', 'mall', 'reliance', 'dmart', 'supermarket', 'groceries', 'mart', 'meesho', 'paytm mall'],
    'Utilities': ['electricity', 'water', 'gas', 'broadband', 'airtel', 'jio', 'recharge', 'mobile', 'dth', 'bill', 'insurance'],
    'Rent': ['rent', 'landlord', 'pg', 'hostel fee', 'maintenance'],
    'Travel': ['uber', 'ola', 'rapido', 'irctc', 'train', 'flight', 'petrol', 'diesel', 'fuel', 'metro', 'auto', 'bus'],
    'Salary': ['salary', 'allowance', 'stipend', 'bonus', 'wage'],
    'Investment': ['mutual fund', 'zerodha', 'groww', 'stock', 'share', 'dividend', 'sip', 'fd', 'rd'],
    'Self Transfer': ['self', 'transfer to self', 'own account', 'transfer from self'],
    'Entertainment': ['netflix', 'prime', 'spotify', 'movie', 'cinema', 'bookmyshow', 'game', 'pub'],
}

def auto_categorize(description: str, trans_type: str) -> str:
    desc_lower = description.lower()
    
    # First, handle obvious income categories if the type is INCOME
    if trans_type == 'INCOME':
        if 'salary' in desc_lower or 'stipend' in desc_lower:
            return 'Salary'
        if 'interest' in desc_lower:
            return 'Interest'
        if 'cashback' in desc_lower or 'refund' in desc_lower:
            return 'Refund/Cashback'
        if 'dividend' in desc_lower:
            return 'Investment'
        
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in desc_lower:
                return category
                
    return 'Other'

def parse_statement_text(text: str, account_type: str):
    """
    Strict Bank Statement Parser for SBI, APGB, and Generic statements.
    Extracts transactions by strictly identifying decimal monetary amounts (Withdrawals, Deposits, Balance)
    and filtering out non-decimal reference numbers, years, and transaction IDs.
    """
    transactions = []
    lines = text.split('\n')
    
    # Matches dates like 02-05-2026, 02/05/2026, 02-May-2026, 02 May 2026
    date_pattern = r'(\d{1,2}[-/\.\s](?:[a-zA-Z]{3}|\d{1,2})[-/\.\s]\d{2,4})'
    
    # Strictly matches monetary amounts with decimal points (e.g. 93.00, 1,250.50, 0.50)
    # Does NOT match integers like reference numbers 499514807162 or years 2026
    decimal_amount_pattern = r'\b\d{1,3}(?:,\d{3})*\.\d{2}\b|\b\d+\.\d{2}\b'

    current_tx = None

    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Ignore table headers and footer lines
        if any(h in line.lower() for h in ['tran particulars', 'withdrawals', 'deposits', 'statement of account', 'generated on', 'page no']):
            continue

        date_match = re.search(date_pattern, line)

        if date_match:
            # If we already had a transaction buffering, save it if valid
            if current_tx and current_tx.get('amount') is not None:
                transactions.append(current_tx)
                current_tx = None

            date_str = date_match.group(1)
            parsed_date = None
            for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y', '%d %b %Y', '%d-%b-%Y', '%d-%b-%y', '%d/%m/%y'):
                try:
                    clean_date = re.sub(r'\s+', ' ', date_str).strip()
                    parsed_date = datetime.strptime(clean_date, fmt).date()
                    break
                except ValueError:
                    continue

            if not parsed_date:
                continue

            remainder = line.replace(date_str, '', 1).strip()

            current_tx = {
                'date': parsed_date.strftime('%Y-%m-%d'),
                'desc_parts': [remainder],
                'amount': None,
                'type': 'EXPENSE',
                'category': 'Other'
            }

            # Check if decimal monetary values exist on this line
            decimals = re.findall(decimal_amount_pattern, remainder)
            if decimals:
                valid_dec = [float(d.replace(',', '')) for d in decimals if float(d.replace(',', '')) > 0.0]
                if valid_dec:
                    # Transaction amount is the first decimal monetary value
                    current_tx['amount'] = valid_dec[0]
                    current_tx['type'] = determine_tx_type(remainder, account_type)

        else:
            # Line does not start with a date. It could be continuation of description or amount on next line.
            if current_tx:
                current_tx['desc_parts'].append(line)

                if current_tx['amount'] is None:
                    decimals = re.findall(decimal_amount_pattern, line)
                    if decimals:
                        valid_dec = [float(d.replace(',', '')) for d in decimals if float(d.replace(',', '')) > 0.0]
                        if valid_dec:
                            current_tx['amount'] = valid_dec[0]
                            full_context = " ".join(current_tx['desc_parts'])
                            current_tx['type'] = determine_tx_type(full_context, account_type)

    # Save the last transaction if valid
    if current_tx and current_tx.get('amount') is not None:
        transactions.append(current_tx)

    # Finalize descriptions & categories
    final_list = []
    for tx in transactions:
        raw_desc = " ".join(tx['desc_parts'])

        # Remove decimal monetary values from description
        clean_desc = re.sub(decimal_amount_pattern, '', raw_desc)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
        clean_desc = re.sub(r'^[-/,:\.\s]+|[-/,:\.\s]+$', '', clean_desc).strip()

        if not clean_desc:
            clean_desc = "Bank Transaction"

        category = auto_categorize(clean_desc, tx['type'])

        final_list.append({
            'date': tx['date'],
            'description': clean_desc,
            'amount': tx['amount'],
            'type': tx['type'],
            'category': category
        })

    return final_list

def determine_tx_type(text_context: str, account_type: str) -> str:
    lower_ctx = text_context.lower()
    
    # Check for UPI credit/debit keywords first
    if 'upi/c/' in lower_ctx:
        return 'INCOME'
    elif 'upi/d/' in lower_ctx:
        return 'EXPENSE'
        
    # Check for general keywords
    if 'cr' in lower_ctx or 'credit' in lower_ctx or 'deposit' in lower_ctx or 'refund' in lower_ctx or 'int.pd' in lower_ctx or 'by ' in lower_ctx:
        return 'INCOME'
    elif 'dr' in lower_ctx or 'debit' in lower_ctx or 'withdrawal' in lower_ctx or 'chrg' in lower_ctx or 'to ' in lower_ctx:
        return 'EXPENSE'
            
    return 'EXPENSE'



def extract_text_from_pdf(pdf_file, password=None):
    """
    Given a file-like object (or path) of a PDF, decrypts it using the password (if provided)
    and extracts text from all pages.
    """
    import pypdf
    try:
        reader = pypdf.PdfReader(pdf_file)
        if reader.is_encrypted:
            if not password:
                raise ValueError("PDF is encrypted. Please provide a password.")
            
            # Try to decrypt
            decrypt_result = reader.decrypt(password)
            if decrypt_result == 0:
                raise ValueError("Incorrect password for PDF.")
        
        # Verify access to pages
        try:
            num_pages = len(reader.pages)
        except Exception:
            raise ValueError("Incorrect password for PDF.")

        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return text
    except Exception as e:
        if "password" in str(e).lower() or "decrypt" in str(e).lower() or "encrypted" in str(e).lower():
            raise ValueError("Incorrect password for PDF.")
        raise ValueError(f"Failed to process PDF: {str(e)}")

