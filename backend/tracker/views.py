import json
import os
import uuid
from decimal import Decimal
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.utils.dateparse import parse_date, parse_datetime
from .models import Transaction, Category
from .parser import parse_statement_text, auto_categorize, extract_text_from_pdf, parse_excel_or_csv


# In-memory active session tokens
ACTIVE_SESSIONS = set()

# Load credentials from environment with default fallbacks
def get_auth_credentials():
    return {
        'username': os.environ.get('APP_USERNAME', 'Karthik'),
        'password': os.environ.get('APP_PASSWORD', 'Msk@2005'),
        'pin': os.environ.get('APP_PIN', '05012005')
    }

def verify_token(request):
    """
    Checks the request's Authorization header.
    Returns True if valid, False otherwise.
    """
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        if token in ACTIVE_SESSIONS:
            return True
    return False

def _parse_date_or_datetime(value):
    """Parse a date string, accepting both date-only and datetime formats."""
    if not value:
        return None
    # Try datetime first (e.g. 2026-07-31T14:30)
    dt = parse_datetime(value)
    if dt:
        return dt
    # Fallback to date-only (e.g. 2026-07-31)
    d = parse_date(value)
    if d:
        from django.utils import timezone
        import datetime
        return timezone.make_aware(datetime.datetime.combine(d, datetime.time()))
    return None

def _serialize_transaction(t):
    """Serialize a Transaction instance to a dict."""
    return {
        'id': t.id,
        'date': t.date.strftime('%Y-%m-%dT%H:%M'),
        'description': t.description,
        'amount': float(t.amount),
        'type': t.type,
        'account': t.account,
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
                token = str(uuid.uuid4())
                ACTIVE_SESSIONS.add(token)
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
        
        transactions = Transaction.objects.all()
        if account_filter:
            transactions = transactions.filter(account=account_filter)
        if category_filter:
            transactions = transactions.filter(category=category_filter)
            
        data = [_serialize_transaction(t) for t in transactions]
        return JsonResponse(data, safe=False)
        
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            dt = _parse_date_or_datetime(body.get('date'))
            if not dt:
                from django.utils import timezone
                dt = timezone.now()
            t = Transaction.objects.create(
                date=dt,
                description=body.get('description', 'Manual Transaction'),
                amount=Decimal(str(body.get('amount', 0))),
                type=body.get('type', 'EXPENSE'),
                account=body.get('account', 'CASH'),
                category=body.get('category', 'Other')
            )
            return JsonResponse(_serialize_transaction(t), status=201)
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
                t.description = body['description']
            if 'amount' in body:
                t.amount = Decimal(str(body['amount']))
            if 'type' in body:
                t.type = body['type']
            if 'account' in body:
                t.account = body['account']
            if 'category' in body:
                t.category = body['category']
            t.save()
            return JsonResponse(_serialize_transaction(t), status=200)
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
            # Check for file upload (CSV or Excel)
            if request.FILES:
                file_obj = request.FILES.get('file')
                if not file_obj:
                    return JsonResponse({'error': 'No file uploaded'}, status=400)
                    
                parsed_transactions = parse_excel_or_csv(file_obj)
                return JsonResponse(parsed_transactions, safe=False)
            else:
                # Text pasting or direct JSON body list
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
                if category == 'Other':
                    category = auto_categorize(item.get('description', ''), item.get('type', 'EXPENSE'))
                
                dt = _parse_date_or_datetime(item.get('date'))
                if not dt:
                    from django.utils import timezone
                    dt = timezone.now()
                    
                t = Transaction.objects.create(
                    date=dt,
                    description=item.get('description', 'Imported transaction'),
                    amount=Decimal(str(item.get('amount', 0))),
                    type=item.get('type', 'EXPENSE'),
                    account=account,
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
        transactions = Transaction.objects.all()
        
        total_income = sum(t.amount for t in transactions if t.type == 'INCOME')
        total_expense = sum(t.amount for t in transactions if t.type == 'EXPENSE')
        net_savings = total_income - total_expense
        
        sbi_balance = sum((t.amount if t.type == 'INCOME' else -t.amount) for t in transactions if t.account == 'SBI')
        apgb_balance = sum((t.amount if t.type == 'INCOME' else -t.amount) for t in transactions if t.account == 'APGB')
        cash_balance = sum((t.amount if t.type == 'INCOME' else -t.amount) for t in transactions if t.account == 'CASH')
        
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
            'net_savings': float(net_savings),
            'savings_rate': round(savings_rate, 2),
            'balances': {
                'SBI': float(sbi_balance),
                'APGB': float(apgb_balance),
                'CASH': float(cash_balance),
                'total': float(sbi_balance + apgb_balance + cash_balance)
            },
            'categories': category_data,
            'advice': advice
        })
