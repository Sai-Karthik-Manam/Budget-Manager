from django.db import migrations


NEW_CATEGORIES = [
    ('Remaining Balance', '⚖️'),
    ('Previous Balance', '🏦'),
    ('Default Amount', '💵'),
    ('Rapido', '🛵'),
    ('Food', '🍔'),
    ('Shopping', '🛒'),
    ('Utilities', '⚡'),
    ('Rent', '🏠'),
    ('Travel', '✈️'),
    ('Salary', '💰'),
    ('Investment', '📈'),
    ('Self Transfer', '🔄'),
    ('Entertainment', '🎬'),
    ('Interest', '💳'),
    ('Refund/Cashback', '💸'),
    ('Other', '📦'),
]


def add_categories(apps, schema_editor):
    Category = apps.get_model('tracker', 'Category')
    for name, emoji in NEW_CATEGORIES:
        Category.objects.get_or_create(
            name=name,
            defaults={'emoji': emoji, 'is_default': True}
        )


def reverse_categories(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0004_transaction_to_account_alter_transaction_type'),
    ]

    operations = [
        migrations.RunPython(add_categories, reverse_categories),
    ]
