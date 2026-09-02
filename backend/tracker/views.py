import json
import os
from decimal import Decimal
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.utils.dateparse import parse_date, parse_datetime
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from .models import Transaction, Category
from .parser import parse_statement_text, auto_categorize, extract_text_from_pdf, parse_excel_or_csv


SIGNER_SALT = 'wealth_sense_auth_salt_v1'

# Load credentials from environment with default fallbacks
def get_auth_credentials():
    return {
        'username': os.environ.get('APP_USERNAME', 'Karthik'),
        'password': os.environ.get('APP_PASSWORD', 'Msk@2005'),
        'pin': os.environ.get('APP_PIN', '05012005')
    }

def verify_token(request):
    """
    Checks the request's Authorization header using cryptographically signed tokens.
    Persistent across multiple server processes and restarts.
    """
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            signer = TimestampSigner(salt=SIGNER_SALT)
            # Token valid for 30 days
            signer.unsign(token, max_age=86400 * 30)
            return True
        except (BadSignature, SignatureExpired):
            return False
    return False

def _parse_date_or_datetime(value):
    """Parse a date string, accepting both date-only and datetime formats."""
    if not value:
        return None
    dt = parse_datetime(value)
    if dt:
        return dt
    d = parse_date(value)
    if d:
        from django.utils import timezone
        import datetime
        return timezone.make_aware(datetime.datetime.combine(d, datetime.time()))
    return None

def _parse_amount(value):
    """Sanitize and parse decimal amount."""
    if value is None or value == '':
        raise ValueError('Amount cannot be empty')
    cleaned = str(value).replace('₹', '').replace('$', '').replace(',', '').strip()
    amt = Decimal(cleaned)
    if amt <= 0:
        raise ValueError('Amount must be greater than 0')
    return amt

def _serialize_transaction(t):
    """Serialize a Transaction instance to a dict."""
    return {
        'id': t.id,
        'date': t.date.strftime('%Y-%m-%dT%H:%M'),
        'description': t.description,
        'amount': float(t.amount),
        'type': t.type,
        'account': t.account,
        'to_account': t.to_account,
        'category': t.category
    }

@csrf_exempt
def auth_login(request):
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            username = body.get('username')
            password = body.get('password')
            pin = body.get('pin')
            
            creds = get_auth_credentials()
            
            if username == creds['username'] and password == creds['password'] and pin == creds['pin']:
                signer = TimestampSigner(salt=SIGNER_SALT)
                token = signer.sign(username)
                return JsonResponse({'success': True, 'token': token})
            else:
                return JsonResponse({'success': False, 'error': 'Invalid credentials or PIN'}, status=401)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def transaction_list_create(request):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'GET':
        account_filter = request.GET.get('account', None)
        category_filter = request.GET.get('category', None)
        type_filter = request.GET.get('type', None)
        
        transactions = Transaction.objects.all()
        if account_filter and account_filter != 'ALL':
            from django.db.models import Q
            # Include if account matches source or destination
            transactions = transactions.filter(Q(account=account_filter) | Q(to_account=account_filter))
        if category_filter and category_filter != 'ALL':
            transactions = transactions.filter(category=category_filter)
        if type_filter and type_filter != 'ALL':
            transactions = transactions.filter(type=type_filter)
            
        data = [_serialize_transaction(t) for t in transactions]
        return JsonResponse(data, safe=False)
        
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            dt = _parse_date_or_datetime(body.get('date'))
            if not dt:
                from django.utils import timezone
                dt = timezone.now()
                
            amount = _parse_amount(body.get('amount'))
            t_type = body.get('type', 'EXPENSE')
            account = body.get('account', 'CASH')
            to_account = body.get('to_account', None)
            category = body.get('category', 'Other')
            
            if t_type == 'TRANSFER':
                if not to_account:
                    return JsonResponse({'error': 'Destination (To Account) is required for transfer'}, status=400)
                if account == to_account:
                    return JsonResponse({'error': 'Source and Destination accounts cannot be the same'}, status=400)
                if category == 'Other':
                    category = 'Self Transfer'
            else:
                to_account = None

            description = body.get('description', '').strip()
            if not description:
                if t_type == 'TRANSFER':
                    description = f"Transfer {account} to {to_account}"
                else:
                    description = f"{category} Transaction"

            t = Transaction.objects.create(
                date=dt,
                description=description,
                amount=amount,
                type=t_type,
                account=account,
                to_account=to_account,
                category=category
            )
            return JsonResponse(_serialize_transaction(t), status=201)
        except ValueError as ve:
            return JsonResponse({'error': str(ve)}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

@csrf_exempt
def transaction_detail(request, pk):
    """Handle GET, PUT, and DELETE for a single transaction."""
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    
    try:
        t = Transaction.objects.get(pk=pk)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)
        
    if request.method == 'DELETE':
        t.delete()
        return JsonResponse({'success': True}, status=200)
    
    elif request.method == 'PUT':
        try:
            body = json.loads(request.body)
            if 'date' in body:
                dt = _parse_date_or_datetime(body['date'])
                if dt:
                    t.date = dt
            if 'description' in body:
                t.description = body['description'].strip()
            if 'amount' in body:
                t.amount = _parse_amount(body['amount'])
            if 'type' in body:
                t.type = body['type']
            if 'account' in body:
                t.account = body['account']
            if 'to_account' in body:
                t.to_account = body['to_account'] if t.type == 'TRANSFER' else None
            if 'category' in body:
                t.category = body['category']

            if t.type == 'TRANSFER':
                if not t.to_account:
                    return JsonResponse({'error': 'Destination account is required for transfer'}, status=400)
                if t.account == t.to_account:
                    return JsonResponse({'error': 'Source and Destination accounts cannot be the same'}, status=400)
            else:
                t.to_account = None

            t.save()
            return JsonResponse(_serialize_transaction(t), status=200)
        except ValueError as ve:
            return JsonResponse({'error': str(ve)}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    
    elif request.method == 'GET':
        return JsonResponse(_serialize_transaction(t))
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def category_list_create(request):
    """List all categories or create a new one."""
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if request.method == 'GET':
        categories = Category.objects.all()
        data = [{'id': c.id, 'name': c.name, 'emoji': c.emoji, 'is_default': c.is_default} for c in categories]
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            name = body.get('name', '').strip()
            emoji = body.get('emoji', '📦').strip()
            if not name:
                return JsonResponse({'error': 'Category name is required'}, status=400)
            
            cat, created = Category.objects.get_or_create(
                name=name,
                defaults={'emoji': emoji, 'is_default': False}
            )
            if not created:
                return JsonResponse({'error': 'Category already exists'}, status=400)
            
            return JsonResponse({'id': cat.id, 'name': cat.name, 'emoji': cat.emoji, 'is_default': cat.is_default}, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def category_delete(request, pk):
    """Delete a category (only non-default ones)."""
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if request.method == 'DELETE':
        try:
            cat = Category.objects.get(pk=pk)
            if cat.is_default:
                return JsonResponse({'error': 'Cannot delete default categories'}, status=400)
            cat.delete()
            return JsonResponse({'success': True}, status=200)
        except Category.DoesNotExist:
            return JsonResponse({'error': 'Category not found'}, status=404)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def parse_statement(request):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'POST':
        try:
            if request.FILES:
                file_obj = request.FILES.get('file')
                if not file_obj:
                    return JsonResponse({'error': 'No file uploaded'}, status=400)
                    
                parsed_transactions = parse_excel_or_csv(file_obj)
                return JsonResponse(parsed_transactions, safe=False)
            else:
                body = json.loads(request.body)
                parsed_transactions = body.get('transactions', [])
                return JsonResponse(parsed_transactions, safe=False)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def bulk_import(request):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            transactions_data = body.get('transactions', [])
            account = body.get('account', 'CASH')
            
            created_transactions = []
            for item in transactions_data:
                category = item.get('category', 'Other')
                t_type = item.get('type', 'EXPENSE')
                to_acc = item.get('to_account', None)
                
                if category == 'Other':
                    category = auto_categorize(item.get('description', ''), t_type)
                
                dt = _parse_date_or_datetime(item.get('date'))
                if not dt:
                    from django.utils import timezone
                    dt = timezone.now()
                
                amt = _parse_amount(item.get('amount', 0))
                
                t = Transaction.objects.create(
                    date=dt,
                    description=item.get('description', 'Imported transaction'),
                    amount=amt,
                    type=t_type,
                    account=account,
                    to_account=to_acc,
                    category=category
                )
                created_transactions.append(_serialize_transaction(t))
            return JsonResponse({'success': True, 'count': len(created_transactions), 'transactions': created_transactions}, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

def financial_insights(request):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'GET':
        transactions = list(Transaction.objects.all())
        
        # Total Income & Expense (Transfers excluded from income/expense to preserve true budget)
        total_income = sum(t.amount for t in transactions if t.type == 'INCOME')
        total_expense = sum(t.amount for t in transactions if t.type == 'EXPENSE')
        total_transferred = sum(t.amount for t in transactions if t.type == 'TRANSFER')
        net_savings = total_income - total_expense
        
        def calculate_account_balance(acc_code):
            bal = Decimal('0.00')
            for t in transactions:
                if t.account == acc_code:
                    if t.type == 'INCOME':
                        bal += t.amount
                    elif t.type in ('EXPENSE', 'TRANSFER'):
                        bal -= t.amount
                if t.type == 'TRANSFER' and t.to_account == acc_code:
                    bal += t.amount
            return float(bal)

        sbi_balance = calculate_account_balance('SBI')
        apgb_balance = calculate_account_balance('APGB')
        hdfc_balance = calculate_account_balance('HDFC')
        cash_balance = calculate_account_balance('CASH')
        total_capital = sbi_balance + apgb_balance + hdfc_balance + cash_balance
        
        categories = {}
        for t in transactions:
            if t.type == 'EXPENSE':
                categories[t.category] = categories.get(t.category, 0) + float(t.amount)
                
        category_data = [{'category': cat, 'amount': amt} for cat, amt in categories.items()]
        category_data = sorted(category_data, key=lambda x: x['amount'], reverse=True)
        
        savings_rate = 0.0
        if total_income > 0:
            savings_rate = float((net_savings / total_income) * 100)
            
        advice = []
        if total_expense > total_income:
            advice.append({
                'type': 'warning',
                'title': 'Deficit Spending!',
                'description': 'Your expenses exceed your income. You are drawing from savings or accumulating debt.'
            })
            
        total_expense_float = float(total_expense)
        if total_expense_float > 0:
            for cat, amt in categories.items():
                pct = (amt / total_expense_float) * 100
                if pct > 20 and cat not in ['Rent', 'Investment']:
                    advice.append({
                        'type': 'caution',
                        'title': f'High spending on {cat}',
                        'description': f'You spent {pct:.1f}% of your budget (₹{amt:.2f}) on {cat}. Try to set a strict limit here next month.'
                    })
                    
        if sbi_balance < 2000 and sbi_balance > 0:
            advice.append({
                'type': 'info',
                'title': 'Low Balance: SBI',
                'description': 'Your SBI balance is below ₹2,000. Be cautious of minimum balance rules.'
            })
        if apgb_balance < 1000 and apgb_balance > 0:
            advice.append({
                'type': 'info',
                'title': 'Low Balance: APGB',
                'description': 'Your APGB balance is below ₹1,000. Consider topping it up from Cash.'
            })
        if hdfc_balance < 2500 and hdfc_balance > 0:
            advice.append({
                'type': 'info',
                'title': 'Low Balance: HDFC',
                'description': 'Your HDFC balance is below ₹2,500. Be cautious of minimum balance rules.'
            })
            
        if not advice:
            advice.append({
                'type': 'success',
                'title': 'Healthy Finances',
                'description': 'You have healthy transaction logs and a positive savings rate. Keep up the disciplined tracking!'
            })
        else:
            advice.append({
                'type': 'tip',
                'title': '50/30/20 Budgeting Rule',
                'description': 'Allocate 50% of income to Needs (Rent, Utilities), 30% to Wants (Food, Shopping), and 20% to Savings.'
            })
            
        return JsonResponse({
            'total_income': float(total_income),
            'total_expense': float(total_expense),
            'total_transferred': float(total_transferred),
            'net_savings': float(net_savings),
            'savings_rate': round(savings_rate, 2),
            'balances': {
                'SBI': sbi_balance,
                'APGB': apgb_balance,
                'HDFC': hdfc_balance,
                'CASH': cash_balance,
                'total': total_capital
            },
            'categories': category_data,
            'advice': advice
        })
