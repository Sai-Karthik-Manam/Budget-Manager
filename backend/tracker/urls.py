from django.urls import path
from . import views

urlpatterns = [
    path('auth/login/', views.auth_login, name='auth_login'),
    path('transactions/', views.transaction_list_create, name='transaction_list_create'),
    path('transactions/<int:pk>/', views.transaction_detail, name='transaction_detail'),
    path('categories/', views.category_list_create, name='category_list_create'),
    path('categories/<int:pk>/', views.category_delete, name='category_delete'),
    path('parse-statement/', views.parse_statement, name='parse_statement'),
    path('bulk-import/', views.bulk_import, name='bulk_import'),
    path('insights/', views.financial_insights, name='financial_insights'),
]
