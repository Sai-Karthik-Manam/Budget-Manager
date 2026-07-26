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
    Supports multi-line layout where date/description and amounts are split.
    """
    transactions = []
    lines = text.split('\n')
    
    date_pattern = r'(\d{1,2}[-/\.\s](?:[a-zA-Z]{3}|\d{1,2})[-/\.\s]\d{2,4})'
    
    pending_tx = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Find dates in the line
        date_match = re.search(date_pattern, line)
        
        if date_match:
            # If we had a pending transaction, let's flush/save it if it has an amount
            if pending_tx and pending_tx.get('amount') is not None:
                transactions.append(pending_tx)
                pending_tx = None
                
            date_str = date_match.group(1)
            parsed_date = None
            for fmt in ('%d %b %Y', '%d-%b-%y', '%d-%b-%Y', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%y', '%d-%m-%y'):
                try:
                    clean_date_str = re.sub(r'\s+', ' ', date_str).strip()
                    parsed_date = datetime.strptime(clean_date_str, fmt).date()
                    break
                except ValueError:
                    continue
            
            if not parsed_date:
                continue
                
            remainder = line.replace(date_str, '', 1).strip()
            
            # Start a new pending transaction
            pending_tx = {
                'date': parsed_date.strftime('%Y-%m-%d'),
                'raw_lines': [remainder],
                'amount': None,
                'type': 'EXPENSE',
                'category': 'Other'
            }
            
            # Parse amounts from this initial line
            amount_matches = re.findall(r'\b\d+(?:,\d{3})*(?:\.\d{2})?\b', remainder)
            amounts = []
            for amt in amount_matches:
                val_str = amt.replace(',', '')
                if '.' not in amt:
                    try:
                        val_int = int(val_str)
                        # Ignore large reference numbers and year numbers
                        if val_int > 99999 or (1990 <= val_int <= 2050):
                            continue
                    except ValueError:
                        pass
                try:
                    cleaned_amt = float(val_str)
                    if cleaned_amt > 0.0:
                        amounts.append((amt, cleaned_amt))
                except ValueError:
                    continue
                    
            if amounts:
                # Second-to-last is Withdrawal/Deposit, last is Balance
                pending_tx['amount'] = amounts[-2][1] if len(amounts) >= 2 else amounts[0][1]
                pending_tx['type'] = determine_tx_type(line, account_type)

                
        else:
            # This line does NOT have a date.
            # If we have a pending transaction, check if we can extract the amount from this line,
            # or append the text to the description
            if pending_tx:
                pending_tx['raw_lines'].append(line)
                
                # Check for amounts if not already found
                if pending_tx['amount'] is None:
                    amount_matches = re.findall(r'\b\d+(?:,\d{3})*(?:\.\d{2})?\b', line)
                    amounts = []
                    for amt in amount_matches:
                        val_str = amt.replace(',', '')
                        if '.' not in amt:
                            try:
                                val_int = int(val_str)
                                # Ignore large reference numbers and year numbers
                                if val_int > 99999 or (1990 <= val_int <= 2050):
                                    continue
                            except ValueError:
                                pass
                        try:
                            cleaned_amt = float(val_str)
                            if cleaned_amt > 0.0:
                                amounts.append((amt, cleaned_amt))
                        except ValueError:
                            continue
                            
                    if amounts:
                        # Second-to-last is Withdrawal/Deposit, last is Balance
                        pending_tx['amount'] = amounts[-2][1] if len(amounts) >= 2 else amounts[0][1]
                        full_desc_context = " ".join(pending_tx['raw_lines'])
                        pending_tx['type'] = determine_tx_type(full_desc_context, account_type)

                        
    # Flush the last pending transaction
    if pending_tx and pending_tx.get('amount') is not None:
        transactions.append(pending_tx)
        
    # Format and finalize transactions list
    final_transactions = []
    for tx in transactions:
        full_desc = " ".join(tx['raw_lines'])
        
        # Remove any numeric values that match the parsed amount or balance
        all_nums = re.findall(r'\b\d+(?:,\d{3})*(?:\.\d{2})?\b', full_desc)
        for num in all_nums:
            val_str = num.replace(',', '')
            if '.' not in num:
                try:
                    if int(val_str) > 99999:
                        continue
                except ValueError:
                    pass
            full_desc = full_desc.replace(num, '')
            
        full_desc = re.sub(r'\s+', ' ', full_desc).strip()
        full_desc = re.sub(r'^[-/,:\.\s]+|[-/,:\.\s]+$', '', full_desc).strip()
        
        if not full_desc:
            full_desc = "Online Transaction"
            
        category = auto_categorize(full_desc, tx['type'])
        
        final_transactions.append({
            'date': tx['date'],
            'description': full_desc,
            'amount': tx['amount'],
            'type': tx['type'],
            'category': category
        })
        
    return final_transactions

def determine_tx_type(text_context: str, account_type: str) -> str:
    # Check for UPI credit/debit keywords first
    if 'upi/c/' in text_context.lower():
        return 'INCOME'
    elif 'upi/d/' in text_context.lower():
        return 'EXPENSE'
        
    # Check for general keywords
    if account_type == 'SBI':
        if 'cr' in text_context.lower() or 'credit' in text_context.lower() or 'by ' in text_context.lower() or 'deposit' in text_context.lower() or 'int.pd' in text_context.lower():
            return 'INCOME'
        elif 'dr' in text_context.lower() or 'debit' in text_context.lower() or 'to ' in text_context.lower() or 'withdrawal' in text_context.lower():
            return 'EXPENSE'
    elif account_type == 'APGB':
        if 'cr' in text_context.lower() or 'credit' in text_context.lower() or 'dep' in text_context.lower() or 'by ' in text_context.lower():
            return 'INCOME'
        elif 'dr' in text_context.lower() or 'debit' in text_context.lower() or 'with' in text_context.lower() or 'to ' in text_context.lower():
            return 'EXPENSE'
    else:
        if 'cr' in text_context.lower() or 'credit' in text_context.lower() or 'received' in text_context.lower() or 'refund' in text_context.lower() or 'salary' in text_context.lower():
            return 'INCOME'
        elif 'dr' in text_context.lower() or 'debit' in text_context.lower() or 'spent' in text_context.lower() or 'paid' in text_context.lower():
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

