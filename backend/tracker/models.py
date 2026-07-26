from django.db import models
from django.utils import timezone

class Transaction(models.Model):
    ACCOUNT_CHOICES = [
        ('APGB', 'APGB Bank'),
        ('SBI', 'SBI Bank'),
        ('CASH', 'Cash'),
    ]

    TYPE_CHOICES = [
        ('INCOME', 'Income'),
        ('EXPENSE', 'Expense'),
    ]

    date = models.DateField(default=timezone.now)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    account = models.CharField(max_length=10, choices=ACCOUNT_CHOICES)
    category = models.CharField(max_length=50, default='Other')

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f"{self.date} - {self.account} - {self.type} - {self.amount}"

