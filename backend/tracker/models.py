from django.db import models
from django.utils import timezone


class Category(models.Model):
    name = models.CharField(max_length=50, unique=True)
    emoji = models.CharField(max_length=4, default='📦')
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f"{self.emoji} {self.name}"


class Transaction(models.Model):
    ACCOUNT_CHOICES = [
        ('APGB', 'APGB Bank'),
        ('HDFC', 'HDFC Bank'),
        ('SBI', 'SBI Bank'),
        ('CASH', 'Cash'),
    ]

    TYPE_CHOICES = [
        ('INCOME', 'Income'),
        ('EXPENSE', 'Expense'),
        ('TRANSFER', 'Transfer'),
    ]

    date = models.DateTimeField(default=timezone.now)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    account = models.CharField(max_length=10, choices=ACCOUNT_CHOICES) # Source account
    to_account = models.CharField(max_length=10, choices=ACCOUNT_CHOICES, null=True, blank=True) # Destination account for TRANSFER
    category = models.CharField(max_length=50, default='Other')

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        if self.type == 'TRANSFER' and self.to_account:
            return f"{self.date} - Transfer {self.account} -> {self.to_account} - {self.amount}"
        return f"{self.date} - {self.account} - {self.type} - {self.amount}"
