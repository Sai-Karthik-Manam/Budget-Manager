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
    Parses transaction details from raw text statements (SBI, APGB, or Generic).
    Returns a list of dictionaries with keys: date, description, amount, type, category
    """
    transactions = []
    lines = text.split('\n')
    
    # Common date regexes:
    # 1. 26 Jul 2026 or 26-Jul-26 or 26-Jul-2026
    # 2. 26/07/2026 or 26-07-2026 or 26.07.2026
    date_pattern = r'(\d{1,2}[-/\.\s](?:[a-zA-Z]{3}|\d{1,2})[-/\.\s]\d{2,4})'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Find dates in the line
        date_match = re.search(date_pattern, line)
        if not date_match:
            continue
            
        date_str = date_match.group(1)
        
        # Standardize the date
        parsed_date = None
        for fmt in ('%d %b %Y', '%d-%b-%y', '%d-%b-%Y', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%y', '%d-%m-%y'):
            try:
                # Clean multiple spaces/dots
                clean_date_str = re.sub(r'\s+', ' ', date_str).strip()
                parsed_date = datetime.strptime(clean_date_str, fmt).date()
                break
            except ValueError:
                continue
                
        if not parsed_date:
            # Skip if we couldn't parse the date format
            continue
            
        # Remove date from the line to parse other columns
        remainder = line.replace(date_str, '', 1).strip()
        
        # Find all monetary values in the remainder
        # E.g. 1,234.50 or 500.00 or 15000
        # Positive and negative, ignoring commas
        amount_matches = re.findall(r'\b\d+(?:,\d{3})*(?:\.\d{2})?\b', remainder)
        
        if not amount_matches:
            continue
            
        # Typically in bank statements:
        # SBI/APGB formats list Withdrawal, Deposit, and Balance (sometimes only Withdrawal and Deposit).
        # We need to distinguish credit vs debit.
        # Let's clean the amount matches:
        amounts = []
        for amt in amount_matches:
            try:
                cleaned_amt = float(amt.replace(',', ''))
                # Avoid matching small numbers like reference numbers or transaction IDs
                if cleaned_amt > 0.0:
                    amounts.append((amt, cleaned_amt))
            except ValueError:
                continue
                
        if not amounts:
            continue
            
        # Clean description by removing the amounts
        desc = remainder
        for amt_str, _ in amounts:
            desc = desc.replace(amt_str, '')
        # Remove extra symbols, commas, trailing spaces
        desc = re.sub(r'\s+', ' ', desc).strip()
        desc = re.sub(r'^[-/,:\.\s]+|[-/,:\.\s]+$', '', desc).strip()
        
        if not desc:
            desc = "Online Transaction"
            
        # Deduce transaction type and amount:
        # If we have 3 amounts (Withdrawal, Deposit, Balance or similar):
        # We'll need to figure out which is which based on the bank rules or placement.
        # For now, let's look at the remaining line content to see if it contains "Cr" or "Dr",
        # or if we can extract it.
        # Typically, a statement line might look like:
        # "26 Jul 2026  UPI/O/1234/SBI  500.00  10500.00" -> withdrawal of 500, balance 10500
        # Or: "26 Jul 2026 UPI/O/1234/SBI 500.00 Cr 10500.00" -> credit of 500
        
        trans_type = 'EXPENSE'
        trans_amount = 0.0
        
        # Specific SBI checking
        if account_type == 'SBI':
            if 'cr' in line.lower() or 'credit' in line.lower() or 'by ' in line.lower() or 'deposit' in line.lower():
                trans_type = 'INCOME'
            elif 'dr' in line.lower() or 'debit' in line.lower() or 'to ' in line.lower() or 'withdrawal' in line.lower():
                trans_type = 'EXPENSE'
        # APGB checking
        elif account_type == 'APGB':
            if 'cr' in line.lower() or 'credit' in line.lower() or 'dep' in line.lower() or 'by ' in line.lower():
                trans_type = 'INCOME'
            elif 'dr' in line.lower() or 'debit' in line.lower() or 'with' in line.lower() or 'to ' in line.lower():
                trans_type = 'EXPENSE'
        else:
            # Generic heuristics
            if 'cr' in line.lower() or 'credit' in line.lower() or 'received' in line.lower() or 'refund' in line.lower() or 'salary' in line.lower():
                trans_type = 'INCOME'
            elif 'dr' in line.lower() or 'debit' in line.lower() or 'spent' in line.lower() or 'paid' in line.lower():
                trans_type = 'EXPENSE'
                
        # Choose amount: usually the first amount is the transaction value, and the second is the balance.
        # Let's pick the first amount.
        trans_amount = amounts[0][1]
        
        # In case the text has "SBI" style double columns like "   500.00       " vs "       500.00  "
        # We can analyze the spacing or order if needed, but the user can review/edit before final import.
        # Let's write the transaction:
        category = auto_categorize(desc, trans_type)
        
        transactions.append({
            'date': parsed_date.strftime('%Y-%m-%d'),
            'description': desc,
            'amount': trans_amount,
            'type': trans_type,
            'category': category
        })
        
    return transactions
