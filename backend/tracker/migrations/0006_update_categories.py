from django.db import migrations


NEW_CATEGORIES = [
    ('Bills', '🧾'),
    ('Bus', '🚌'),
    ('Card Fee', '💳'),
    ('Drinks', '🥤'),
    ('Education', '📚'),
    ('EMI', '📅'),
    ('Entertainment', '🎬'),
    ('FastFood', '🍟'),
    ('Fuel', '⛽'),
    ('Fruits & Vegetables', '🥦'),
    ('Gift', '🎁'),
    ('Groceries', '🛒'),
    ('Health', '💊'),
    ('Hobby', '🎨'),
    ('Internet/Mobile', '📶'),
    ('Investment', '📈'),
    ('Metro', '🚇'),
    ('Parking', '🅿️'),
    ('Personal Grooming', '💇'),
    ('Previous Balance', '🏦'),
    ('Rapido', '🛵'),
    ('Rent', '🏠'),
    ('Restaurant', '🍽️'),
    ('Salary', '💰'),
    ('Self Transfer', '🔄'),
    ('Social', '🥳'),
    ('Stationary', '✏️'),
    ('Train', '🚆'),
    ('Travel', '✈️'),
    ('Interest', '💱'),
    ('Refund/Cashback', '💸'),
    ('Other', '📦'),
]

REMOVE_CATEGORIES = [
    'Food', 'Shopping', 'Utilities', 'Remaining Balance', 'Default Amount',
]


def add_categories(apps, schema_editor):
    Category = apps.get_model('tracker', 'Category')
    # Remove old unwanted ones (only non-default ones that may exist, or mark is_default False)
    Category.objects.filter(name__in=REMOVE_CATEGORIES).delete()
    for name, emoji in NEW_CATEGORIES:
        Category.objects.update_or_create(
            name=name,
            defaults={'emoji': emoji, 'is_default': True}
        )


def reverse_categories(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0005_add_more_categories'),
    ]

    operations = [
        migrations.RunPython(add_categories, reverse_categories),
    ]
