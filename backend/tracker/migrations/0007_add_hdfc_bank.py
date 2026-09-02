from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0006_update_categories'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='account',
            field=models.CharField(choices=[('APGB', 'APGB Bank'), ('HDFC', 'HDFC Bank'), ('SBI', 'SBI Bank'), ('CASH', 'Cash')], max_length=10),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='to_account',
            field=models.CharField(blank=True, choices=[('APGB', 'APGB Bank'), ('HDFC', 'HDFC Bank'), ('SBI', 'SBI Bank'), ('CASH', 'Cash')], max_length=10, null=True),
        ),
    ]
