import json
import os
import uuid
from decimal import Decimal
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.utils.dateparse import parse_date
from .models import Transaction
from .parser import parse_statement_text, auto_categorize, extract_text_from_pdf


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
            
        data = []
        for t in transactions:
            data.append({
                'id': t.id,
                'date': t.date.strftime('%Y-%m-%d'),
                'description': t.description,
                'amount': float(t.amount),
                'type': t.type,
                'account': t.account,
                'category': t.category
            })
        return JsonResponse(data, safe=False)
        
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            t = Transaction.objects.create(
                date=parse_date(body.get('date')),
                description=body.get('description', 'Manual Transaction'),
                amount=Decimal(str(body.get('amount', 0))),
                type=body.get('type', 'EXPENSE'),
                account=body.get('account', 'CASH'),
                category=body.get('category', 'Other')
            )
            return JsonResponse({
                'id': t.id,
                'date': t.date.strftime('%Y-%m-%d'),
                'description': t.description,
                'amount': float(t.amount),
                'type': t.type,
                'account': t.account,
                'category': t.category
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

@csrf_exempt
def transaction_detail_delete(request, pk):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'DELETE':
        try:
            t = Transaction.objects.get(pk=pk)
            t.delete()
            return JsonResponse({'success': True}, status=200)
        except Transaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def parse_statement(request):
    if not verify_token(request):
        return JsonResponse({'error': 'Unauthorized'}, status=401)
        
    if request.method == 'POST':
        try:
            # Check for file upload
            if request.FILES:
                file_obj = request.FILES.get('file')
                password = request.POST.get('password', None)
                account = request.POST.get('account', 'SBI')
                
                if not file_obj:
                    return JsonResponse({'error': 'No file uploaded'}, status=400)
                    
                file_name = file_obj.name.lower()
                if file_name.endswith('.pdf'):
                    text = extract_text_from_pdf(file_obj, password)
                else:
                    text = file_obj.read().decode('utf-8', errors='ignore')
            else:
                body = json.loads(request.body)
                text = body.get('text', '')
                account = body.get('account', 'SBI')
                
            if not text or not text.strip():
                return JsonResponse({'error': 'No text extracted or provided'}, status=400)
                
            parsed_transactions = parse_statement_text(text, account)
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
                    
                t = Transaction.objects.create(
                    date=parse_date(item.get('date')),
                    description=item.get('description', 'Imported transaction'),
                    amount=Decimal(str(item.get('amount', 0))),
                    type=item.get('type', 'EXPENSE'),
                    account=account,
                    category=category
                )
                created_transactions.append({
                    'id': t.id,
                    'date': t.date.strftime('%Y-%m-%d'),
                    'description': t.description,
                    'amount': float(t.amount),
                    'type': t.type,
                    'account': t.account,
                    'category': t.category
                })
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
