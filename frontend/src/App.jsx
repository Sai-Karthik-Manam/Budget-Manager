import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Plus, 
  Trash2, 
  Sparkles, 
  Upload, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  BookOpen, 
  Info,
  DollarSign,
  ArrowRightLeft,
  X,
  Lock,
  User,
  ShieldCheck,
  LogOut,
  Pencil,
  Settings,
  Bell,
  BellOff
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

const API_BASE = '/api';


const DEFAULT_CATEGORIES = [
  'Bills', 'Bus', 'Card Fee', 'Drinks', 'Education', 'EMI',
  'Entertainment', 'FastFood', 'Fuel', 'Fruits & Vegetables',
  'Gift', 'Groceries', 'Health', 'Hobby', 'Internet/Mobile',
  'Investment', 'Metro', 'Parking', 'Personal Grooming', 'Previous Balance',
  'Rapido', 'Rent', 'Restaurant', 'Salary', 'Self Transfer',
  'Stationary', 'Social', 'Train', 'Travel', 'Interest',
  'Refund/Cashback', 'Other'
];

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#64748B'
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginStep, setLoginStep] = useState(1); // 1 = Creds, 2 = PIN
  const [loginCreds, setLoginCreds] = useState({ username: '', password: '' });
  const [verificationPin, setVerificationPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState({
    total_income: 0,
    total_expense: 0,
    net_savings: 0,
    savings_rate: 0,
    balances: { SBI: 0, APGB: 0, CASH: 0, total: 0 },
    categories: [],
    advice: []
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Manual transaction state
  const now = new Date();
  const nowLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const [manualForm, setManualForm] = useState({
    date: nowLocal,
    description: '',
    amount: '',
    type: 'EXPENSE',
    account: 'SBI',
    to_account: 'CASH',
    category: 'Other'
  });

  // Statement Parser state
  const [statementAccount, setStatementAccount] = useState('SBI');
  const [importMode, setImportMode] = useState('MANUAL');
  const [statementFile, setStatementFile] = useState(null);
  const [parsedTransactions, setParsedTransactions] = useState([]);
  const [showParserModal, setShowParserModal] = useState(false);
  const [manualRows, setManualRows] = useState([
    { date: new Date().toISOString().split('T')[0], category: 'Other', description: '', credit: '', debit: '' }
  ]);

  // Categories state (fetched from API)
  const [categories, setCategories] = useState([]);
  const CATEGORIES = categories.length > 0 ? categories.map(c => c.name) : DEFAULT_CATEGORIES;

  // Category settings modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📦');

  // Edit transaction modal
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Daily reminder
  const [reminderEnabled, setReminderEnabled] = useState(() => {
    return sessionStorage.getItem('wealth_sense_reminder') === 'true';
  });

  // Filters state
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    const token = sessionStorage.getItem('wealth_sense_token');
    if (token) {
      setIsAuthenticated(true);
      fetchData(token);
    }

    // Disable Inspect / Right-click
    const handleContextMenu = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      if (e.keyCode === 123) { // F12
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { // Ctrl+Shift+I/J/C
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.keyCode === 85) { // Ctrl+U (View Source)
        e.preventDefault();
        return false;
      }
      if (e.metaKey && e.altKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { // Mac Cmd+Opt+I/J/C
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-logout after 10 minutes of inactivity
  useEffect(() => {
    if (!isAuthenticated) return;

    const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    let idleTimer;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sessionStorage.removeItem('wealth_sense_token');
        setIsAuthenticated(false);
        setLoginStep(1);
        setLoginCreds({ username: '', password: '' });
        setVerificationPin('');
        alert('You have been logged out due to inactivity.');
      }, IDLE_TIMEOUT);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetIdleTimer));
    resetIdleTimer(); // start the timer

    return () => {
      clearTimeout(idleTimer);
      events.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [isAuthenticated]);

  const fetchData = async (overrideToken = null) => {
    const token = overrideToken || sessionStorage.getItem('wealth_sense_token');
    if (!token) return;
    setLoading(true);
    try {
      const txRes = await fetch(`${API_BASE}/transactions/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!txRes.ok) throw new Error('Failed to fetch transactions');
      const txData = await txRes.json();
      setTransactions(txData);

      const insRes = await fetch(`${API_BASE}/insights/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!insRes.ok) throw new Error('Failed to fetch insights');
      const insData = await insRes.json();
      setInsights(insData);

      // Fetch categories
      const catRes = await fetch(`${API_BASE}/categories/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
      }
      
      setError('');
    } catch (err) {
      setError(err.message || 'Connecting to backend...');
    } finally {
      setLoading(false);
    }
  };

  // Login handler step 1
  const handleCredsSubmit = (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginStep(2);
  };

  // Login handler step 2
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginCreds.username,
          password: loginCreds.password,
          pin: verificationPin
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid credentials or verification PIN');
      }
      
      sessionStorage.setItem('wealth_sense_token', data.token);
      setIsAuthenticated(true);
      fetchData(data.token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('wealth_sense_token');
    setIsAuthenticated(false);
    setLoginStep(1);
    setLoginCreds({ username: '', password: '' });
    setVerificationPin('');
  };

  // Create Manual Transaction
  const handleAddManual = async (e) => {
    e.preventDefault();
    if (!manualForm.description || !manualForm.amount) {
      alert('Please fill description and amount.');
      return;
    }
    if (manualForm.type === 'TRANSFER' && (!manualForm.to_account || manualForm.account === manualForm.to_account)) {
      alert('Please select a different destination account for transfer.');
      return;
    }
    const token = sessionStorage.getItem('wealth_sense_token');
    try {
      const res = await fetch(`${API_BASE}/transactions/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(manualForm)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          sessionStorage.removeItem('wealth_sense_token');
          setIsAuthenticated(false);
          alert('Session expired. Please log in again.');
          return;
        }
        throw new Error(errData.error || 'Failed to add transaction');
      }
      
      const n = new Date();
      const nLocal = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
      setManualForm({
        date: nLocal,
        description: '',
        amount: '',
        type: 'EXPENSE',
        account: 'SBI',
        to_account: 'CASH',
        category: 'Other'
      });
      
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Transaction
  const handleDeleteTransaction = async (id) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    const token = sessionStorage.getItem('wealth_sense_token');
    try {
      const res = await fetch(`${API_BASE}/transactions/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          sessionStorage.removeItem('wealth_sense_token');
          setIsAuthenticated(false);
          alert('Session expired. Please log in again.');
          return;
        }
        throw new Error(errData.error || 'Failed to delete transaction');
      }
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Edit Transaction
  const handleStartEdit = (tx) => {
    setEditingTransaction(tx);
    setEditForm({ 
      ...tx,
      to_account: tx.to_account || (tx.account === 'SBI' ? 'CASH' : 'SBI')
    });
  };

  const handleSaveEdit = async () => {
    if (editForm.type === 'TRANSFER' && (!editForm.to_account || editForm.account === editForm.to_account)) {
      alert('Source and destination accounts cannot be the same.');
      return;
    }
    const token = sessionStorage.getItem('wealth_sense_token');
    try {
      const res = await fetch(`${API_BASE}/transactions/${editForm.id}/`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          sessionStorage.removeItem('wealth_sense_token');
          setIsAuthenticated(false);
          alert('Session expired. Please log in again.');
          return;
        }
        throw new Error(errData.error || 'Failed to update transaction');
      }
      setEditingTransaction(null);
      setEditForm({});
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Category CRUD
  const handleAddCategory = async () => {
    if (!newCatName.trim()) { alert('Enter a category name'); return; }
    const token = sessionStorage.getItem('wealth_sense_token');
    try {
      const res = await fetch(`${API_BASE}/categories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newCatName.trim(), emoji: newCatEmoji || '📦' })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setNewCatName('');
      setNewCatEmoji('📦');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category?')) return;
    const token = sessionStorage.getItem('wealth_sense_token');
    try {
      const res = await fetch(`${API_BASE}/categories/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Cannot delete'); }
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Daily Reminder
  useEffect(() => {
    if (!isAuthenticated || !reminderEnabled) return;

    const checkReminder = () => {
      const lastReminded = sessionStorage.getItem('wealth_sense_last_reminder');
      const today = new Date().toISOString().split('T')[0];
      const hour = new Date().getHours();
      
      if (lastReminded !== today && hour >= 20) {
        sessionStorage.setItem('wealth_sense_last_reminder', today);
        if (Notification.permission === 'granted') {
          new Notification('WealthSense Reminder 💰', {
            body: 'Have you logged all your transactions for today?',
            icon: '💰'
          });
        } else {
          alert('💰 Daily Reminder: Have you logged all your transactions for today?');
        }
      }
    };

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    checkReminder();
    const interval = setInterval(checkReminder, 60 * 60 * 1000); // check every hour
    return () => clearInterval(interval);
  }, [isAuthenticated, reminderEnabled]);

  const toggleReminder = () => {
    const newVal = !reminderEnabled;
    setReminderEnabled(newVal);
    sessionStorage.setItem('wealth_sense_reminder', newVal.toString());
    if (newVal && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  // Helper to get emoji for a category name
  const getCategoryEmoji = (name) => {
    const cat = categories.find(c => c.name === name);
    return cat ? cat.emoji : '';
  };


  const handleAddManualRow = () => {
    setManualRows([...manualRows, {
      date: new Date().toISOString().split('T')[0],
      category: 'Other',
      description: '',
      credit: '',
      debit: ''
    }]);
  };

  const handleUpdateManualRow = (idx, field, value) => {
    const updated = [...manualRows];
    updated[idx] = { ...updated[idx], [field]: value };
    setManualRows(updated);
  };

  const handleDeleteManualRow = (idx) => {
    const updated = manualRows.filter((_, i) => i !== idx);
    setManualRows(updated.length > 0 ? updated : [{
      date: new Date().toISOString().split('T')[0],
      category: 'Other',
      description: '',
      credit: '',
      debit: ''
    }]);
  };

  // Parse Statement (CSV/Excel upload or Manual Grid processing)
  const handleParseStatement = async () => {
    if (importMode === 'FILE') {
      if (!statementFile) {
        alert('Please select an Excel or CSV file first.');
        return;
      }

      const token = sessionStorage.getItem('wealth_sense_token');
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append('file', statementFile);
        
        const res = await fetch(`${API_BASE}/parse-statement/`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to parse file');
        }
        if (data.length === 0) {
          alert('Could not find any valid transaction rows in the uploaded file. Please check columns.');
        } else {
          setParsedTransactions(data);
        }
      } catch (err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Manual rows processing
      const validRows = [];
      for (const row of manualRows) {
        const credit = parseFloat(row.credit) || 0;
        const debit = parseFloat(row.debit) || 0;
        
        if (!row.date) continue;
        if (credit === 0 && debit === 0) continue;
        
        validRows.push({
          date: row.date,
          description: row.description || `${row.category} Manual Transaction`,
          amount: credit > 0 ? credit : debit,
          type: credit > 0 ? 'INCOME' : 'EXPENSE',
          category: row.category || 'Other'
        });
      }
      
      if (validRows.length === 0) {
        alert('Please enter at least one valid manual transaction with an amount.');
        return;
      }
      setParsedTransactions(validRows);
    }
  };



  // Confirm Import parsed transactions
  const handleImportParsed = async () => {
    if (parsedTransactions.length === 0) return;
    const token = sessionStorage.getItem('wealth_sense_token');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bulk-import/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transactions: parsedTransactions,
          account: statementAccount
        })
      });
      if (!res.ok) throw new Error('Failed to import transactions');
      
      setParsedTransactions([]);
      setStatementText('');
      setShowParserModal(false);
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleUpdateParsedRow = (index, field, value) => {
    const updated = [...parsedTransactions];
    updated[index][field] = value;
    setParsedTransactions(updated);
  };

  const handleDeleteParsedRow = (index) => {
    const updated = parsedTransactions.filter((_, i) => i !== index);
    setParsedTransactions(updated);
  };

  const filteredTransactions = transactions.filter(t => {
    const matchAcc = accountFilter === 'ALL' || t.account === accountFilter || (t.type === 'TRANSFER' && t.to_account === accountFilter);
    const matchCat = categoryFilter === 'ALL' || t.category === categoryFilter;
    const matchType = typeFilter === 'ALL' || t.type === typeFilter;
    return matchAcc && matchCat && matchType;
  });

  const getMonthlyChartData = () => {
    const monthlyData = {};
    transactions.forEach(t => {
      const month = t.date.substring(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { month, income: 0, expense: 0 };
      }
      if (t.type === 'INCOME') {
        monthlyData[month].income += t.amount;
      } else if (t.type === 'EXPENSE') {
        monthlyData[month].expense += t.amount;
      }
    });
    return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  };

  const monthlyChartData = getMonthlyChartData();

  // If not authenticated, render Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#070A13] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Glow circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/20">
              <Wallet className="h-8 w-8 text-white animate-pulse" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-2">WealthSense Auth</h1>
            <p className="text-xs text-gray-400">Secure Access Portal</p>
          </div>

          {loginError && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {loginStep === 1 ? (
            <form onSubmit={handleCredsSubmit} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Username</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Enter your username" 
                    value={loginCreds.username}
                    onChange={(e) => setLoginCreds({...loginCreds, username: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-500" />
                  <input 
                    type="password" 
                    placeholder="Enter your password" 
                    value={loginCreds.password}
                    onChange={(e) => setLoginCreds({...loginCreds, password: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
              >
                Proceed <ShieldCheck className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handlePinSubmit} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 text-center">
                  Verification Pin (OTP)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-500" />
                  <input 
                    type="password" 
                    maxLength={8}
                    placeholder="Enter 8-digit secure PIN" 
                    value={verificationPin}
                    onChange={(e) => setVerificationPin(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl pl-11 pr-4 py-3 text-center tracking-widest text-lg font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
                <p className="text-[10px] text-gray-500 text-center mt-2">Enter the verification PIN configured for this instance.</p>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setLoginStep(1); setLoginError(''); }}
                  className="w-1/3 bg-[#1E293B] hover:bg-[#2D3748] text-white font-semibold py-3 rounded-xl transition-all"
                >
                  Back
                </button>
                <button 
                  type="submit" 
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-all"
                >
                  Verify & Enter
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div className="min-h-screen bg-[#090D16] text-[#F3F4F6] pb-12">
      {/* Top Banner */}
      <header className="border-b border-[#1E293B] bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              WealthSense <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">v1.0</span>
            </h1>
            <p className="text-xs text-gray-400">Advanced Income & Expense Tracker</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
          <button 
            onClick={fetchData} 
            className="flex items-center gap-1.5 bg-[#1E293B] hover:bg-[#2D3748] px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button 
            onClick={() => setShowParserModal(true)} 
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium shadow-md shadow-indigo-500/10 transition-all"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <button 
            onClick={() => setShowCategoryModal(true)} 
            className="p-2 bg-[#1E293B] hover:bg-[#2D3748] border border-[#232D45] rounded-xl text-gray-400 hover:text-white transition-all"
            title="Category Settings"
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <button 
            onClick={toggleReminder} 
            className={`p-2 border rounded-xl transition-all ${reminderEnabled ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' : 'bg-[#1E293B] border-[#232D45] text-gray-400 hover:text-white hover:bg-[#2D3748]'}`}
            title={reminderEnabled ? 'Reminder ON – click to disable' : 'Enable daily reminder'}
          >
            {reminderEnabled ? <Bell className="h-4 w-4 sm:h-5 sm:w-5" /> : <BellOff className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>

          <button 
            onClick={handleLogout} 
            className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl text-red-400 transition-all"
            title="Logout"
          >
            <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto mt-6 px-6">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 pb-4">
        
        {/* ===== LEFT SIDEBAR PANELS (on desktop) / BOTTOM PANELS (on mobile) ===== */}

        {/* Net Balance & Stats Summary — mobile order-4, desktop stays in left col */}
        <div className="order-4 lg:order-none lg:col-span-1 lg:row-span-1">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Total Capital</h2>
            <div>
              <div className="text-4xl font-extrabold text-white">
                ₹{insights.balances.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-gray-400 mt-1">Sum of SBI, APGB & Cash accounts</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-[#1E293B] pt-4">
              <div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" /> Income
                </span>
                <p className="text-lg font-bold text-emerald-500 mt-0.5">₹{insights.total_income.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-rose-500" /> Spent
                </span>
                <p className="text-lg font-bold text-rose-500 mt-0.5">₹{insights.total_expense.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="bg-[#1E293B]/40 rounded-xl p-3 flex justify-between items-center text-xs">
              <span className="text-gray-400">Overall Savings Rate</span>
              <span className="font-semibold text-blue-400">{insights.savings_rate}%</span>
            </div>
          </div>
        </div>

        {/* Account Breakdown — mobile order-5, desktop stays in left col */}
        <div className="order-5 lg:order-none lg:col-span-1 lg:row-span-1">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-indigo-400" /> Bank & Wallet Accounts
            </h3>
            
            <div className="flex flex-col gap-3">
              {/* SBI Card */}
              <div className="bg-[#1E293B]/30 hover:bg-[#1E293B]/50 border border-[#232D45] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span> State Bank of India (SBI)
                  </span>
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/10">Active</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">₹{insights.balances.SBI.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>

              {/* APGB Card */}
              <div className="bg-[#1E293B]/30 hover:bg-[#1E293B]/50 border border-[#232D45] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500"></span> Andhra Pragathi Grameena Bank
                  </span>
                  <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/10">Active</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">₹{insights.balances.APGB.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>

              {/* HDFC Card */}
              <div className="bg-[#1E293B]/30 hover:bg-[#1E293B]/50 border border-[#232D45] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500"></span> HDFC Bank
                  </span>
                  <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/10">Active</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">₹{(insights.balances.HDFC || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>

              {/* Cash Card */}
              <div className="bg-[#1E293B]/30 hover:bg-[#1E293B]/50 border border-[#232D45] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span> Cash Wallet
                  </span>
                  <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/10">Cash Mode</span>
                </div>
                <div className="text-xl font-bold text-white mt-1">₹{insights.balances.CASH.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Advisor Advice — mobile order-6, desktop stays in left col */}
        <div className="order-6 lg:order-none lg:col-span-1 lg:row-span-1">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" /> Wealth Advisor AI
            </h3>

            <div className="flex flex-col gap-3">
              {insights.advice.map((adv, idx) => {
                let badgeColor = "bg-blue-500/10 border-blue-500/20 text-blue-400";
                let Icon = Info;
                if (adv.type === 'warning') {
                  badgeColor = "bg-red-500/10 border-red-500/20 text-red-400";
                  Icon = AlertTriangle;
                } else if (adv.type === 'caution') {
                  badgeColor = "bg-amber-500/10 border-amber-500/20 text-amber-400";
                  Icon = AlertTriangle;
                } else if (adv.type === 'success') {
                  badgeColor = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                  Icon = CheckCircle;
                }

                return (
                  <div key={idx} className={`p-4 rounded-xl border ${badgeColor} flex gap-3`}>
                    <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">{adv.title}</h4>
                      <p className="text-xs mt-1 text-gray-300 leading-relaxed">{adv.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN PANELS (on desktop) / TOP PANELS (on mobile) ===== */}

        {/* Quick Manual Add Form — mobile order-1 (FIRST!), desktop right col */}
        <div className="order-1 lg:order-none lg:col-span-2 lg:row-start-1">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-400" /> Add Transaction manually
            </h3>
            
            <form onSubmit={handleAddManual} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Date & Time</label>
                <input 
                  type="datetime-local" 
                  value={manualForm.date} 
                  onChange={(e) => setManualForm({...manualForm, date: e.target.value})}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
                <input 
                  type="text" 
                  placeholder={manualForm.type === 'TRANSFER' ? `Transfer ${manualForm.account} to ${manualForm.to_account}` : "e.g. Swiggy Food order"} 
                  value={manualForm.description} 
                  onChange={(e) => setManualForm({...manualForm, description: e.target.value})}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Amount (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="500.00" 
                  value={manualForm.amount} 
                  onChange={(e) => setManualForm({...manualForm, amount: e.target.value})}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Transaction Type</label>
                <select 
                  value={manualForm.type} 
                  onChange={(e) => {
                    const newType = e.target.value;
                    let newToAcc = manualForm.to_account;
                    let newCat = manualForm.category;
                    if (newType === 'TRANSFER') {
                      newCat = 'Self Transfer';
                      if (!newToAcc || newToAcc === manualForm.account) {
                        newToAcc = manualForm.account === 'SBI' ? 'CASH' : 'SBI';
                      }
                    }
                    setManualForm({...manualForm, type: newType, to_account: newToAcc, category: newCat});
                  }}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value="EXPENSE">Expense (Withdrawal / Payment)</option>
                  <option value="INCOME">Income (Deposit / Salary)</option>
                  <option value="TRANSFER">⇄ Transfer (Bank ➔ Bank / Cash)</option>
                </select>
              </div>

              {manualForm.type === 'TRANSFER' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">From Account (Source)</label>
                    <select 
                      value={manualForm.account} 
                      onChange={(e) => {
                        const fromAcc = e.target.value;
                        let toAcc = manualForm.to_account;
                        if (toAcc === fromAcc) {
                          toAcc = fromAcc === 'SBI' ? 'CASH' : 'SBI';
                        }
                        setManualForm({...manualForm, account: fromAcc, to_account: toAcc});
                      }}
                      className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value="SBI">SBI Bank</option>
                      <option value="APGB">APGB Bank</option>
                      <option value="HDFC">HDFC Bank</option>
                      <option value="CASH">Cash Wallet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">To Account (Destination)</label>
                    <select 
                      value={manualForm.to_account || (manualForm.account === 'SBI' ? 'CASH' : 'SBI')} 
                      onChange={(e) => setManualForm({...manualForm, to_account: e.target.value})}
                      className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    >
                      {['SBI', 'APGB', 'HDFC', 'CASH'].filter(acc => acc !== manualForm.account).map(acc => (
                        <option key={acc} value={acc}>
                          {acc === 'SBI' ? 'SBI Bank' : acc === 'APGB' ? 'APGB Bank' : acc === 'HDFC' ? 'HDFC Bank' : 'Cash Wallet'}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Account / Wallet</label>
                  <select 
                    value={manualForm.account} 
                    onChange={(e) => setManualForm({...manualForm, account: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="SBI">SBI Bank</option>
                    <option value="APGB">APGB Bank</option>
                    <option value="HDFC">HDFC Bank</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
                <select 
                  value={manualForm.category} 
                  onChange={(e) => setManualForm({...manualForm, category: e.target.value})}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{getCategoryEmoji(cat)} {cat}</option>)}
                </select>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button 
                  type="submit" 
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-500/10"
                >
                  <Plus className="h-4 w-4" /> Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Transaction Ledger — mobile order-2, desktop right col */}
        <div className="order-2 lg:order-none lg:col-span-2">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-400" /> Transaction Ledger
              </h3>
              
              {/* Ledger Filters */}
              <div className="flex flex-wrap gap-2.5">
                <select 
                  value={accountFilter} 
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="bg-[#0F172A] border border-[#232D45] rounded-lg px-2.5 py-1 text-xs text-gray-300"
                >
                  <option value="ALL">All Accounts</option>
                  <option value="SBI">SBI Bank</option>
                  <option value="APGB">APGB Bank</option>
                  <option value="HDFC">HDFC Bank</option>
                  <option value="CASH">Cash</option>
                </select>

                <select 
                  value={categoryFilter} 
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-[#0F172A] border border-[#232D45] rounded-lg px-2.5 py-1 text-xs text-gray-300"
                >
                  <option value="ALL">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select 
                  value={typeFilter} 
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-[#0F172A] border border-[#232D45] rounded-lg px-2.5 py-1 text-xs text-gray-300"
                >
                  <option value="ALL">All Types</option>
                  <option value="INCOME">Income only</option>
                  <option value="EXPENSE">Expense only</option>
                  <option value="TRANSFER">Transfers only</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-[#232D45] bg-[#161D30]/20">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[#1E293B]/40 text-gray-400 font-semibold border-b border-[#232D45]">
                    <th className="px-4 py-3 text-xs uppercase">Date & Time</th>
                    <th className="px-4 py-3 text-xs uppercase">Account</th>
                    <th className="px-4 py-3 text-xs uppercase">Description</th>
                    <th className="px-4 py-3 text-xs uppercase">Category</th>
                    <th className="px-4 py-3 text-xs uppercase text-right">Amount</th>
                    <th className="px-4 py-3 text-xs uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232D45]">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                        No transactions match the criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map(tx => {
                      const dtParts = tx.date ? tx.date.split('T') : [tx.date, ''];
                      const dateStr = dtParts[0] || '';
                      const timeStr = dtParts[1] || '';
                      return (
                      <tr key={tx.id} className="hover:bg-[#1E293B]/10 transition-colors">
                        <td className="px-4 py-3.5 text-gray-300 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm">{dateStr}</span>
                            {timeStr && <span className="text-[10px] text-gray-500">{timeStr}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {tx.type === 'TRANSFER' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 inline-flex items-center gap-1">
                              <span>{tx.account}</span>
                              <span className="text-gray-400">➔</span>
                              <span>{tx.to_account || 'Account'}</span>
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              tx.account === 'SBI' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                              tx.account === 'APGB' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 
                              tx.account === 'HDFC' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {tx.account}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-white font-medium max-w-xs truncate">{tx.description}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-300">
                          <span>{getCategoryEmoji(tx.category)} {tx.category}</span>
                        </td>
                        <td className={`px-4 py-3.5 font-semibold text-right whitespace-nowrap ${
                          tx.type === 'INCOME' ? 'text-emerald-500' : tx.type === 'EXPENSE' ? 'text-rose-500' : 'text-indigo-400'
                        }`}>
                          {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : '⇄ '}₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button 
                              onClick={() => handleStartEdit(tx)}
                              className="text-gray-400 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-500/10 transition-all"
                              title="Edit Transaction"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                              title="Delete Transaction"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Interactive Visualizations — mobile order-3, desktop right col */}
        <div className="order-3 lg:order-none lg:col-span-2">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Financial Analytics</h3>
              <span className="text-xs text-gray-400">Realtime Charts</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Income vs Spent Bar Chart */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-400 font-medium">Income vs Expense Trend</span>
                <div className="h-64 w-full bg-[#1E293B]/20 rounded-xl p-2 border border-[#232D45]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232D45" />
                      <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
                      <YAxis stroke="#94A3B8" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #232D45' }} />
                      <Legend verticalAlign="top" height={36} />
                      <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Expense Category Pie/Doughnut Chart */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-400 font-medium">Expenses by Category</span>
                <div className="h-64 w-full bg-[#1E293B]/20 rounded-xl p-2 border border-[#232D45] flex items-center justify-center relative">
                  {insights.categories.length === 0 ? (
                    <span className="text-sm text-gray-500">No expense records found</span>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <ResponsiveContainer width="100%" height="90%">
                        <PieChart>
                          <Pie
                            data={insights.categories}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={4}
                          >
                            {insights.categories.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #232D45' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      
                      {/* Short Custom Legend */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[10px] max-h-12 overflow-y-auto px-2">
                        {insights.categories.slice(0, 4).map((entry, index) => (
                          <div key={index} className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                            <span className="text-gray-400">{entry.category}: ₹{entry.amount.toFixed(0)}</span>
                          </div>
                        ))}
                        {insights.categories.length > 4 && (
                          <span className="text-gray-500">+{insights.categories.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* ===== Edit Transaction Modal ===== */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111827] border border-[#232D45] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[#232D45] px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Pencil className="h-5 w-5 text-blue-400" /> Edit Transaction
              </h3>
              <button onClick={() => setEditingTransaction(null)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#1E293B] transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={editForm.date || ''} 
                    onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Amount (₹)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={editForm.amount || ''} 
                    onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
                <input 
                  type="text" 
                  value={editForm.description || ''} 
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Type</label>
                  <select 
                    value={editForm.type || 'EXPENSE'} 
                    onChange={(e) => {
                      const newType = e.target.value;
                      let newToAcc = editForm.to_account;
                      let newCat = editForm.category;
                      if (newType === 'TRANSFER') {
                        newCat = 'Self Transfer';
                        if (!newToAcc || newToAcc === editForm.account) {
                          newToAcc = editForm.account === 'SBI' ? 'CASH' : 'SBI';
                        }
                      }
                      setEditForm({...editForm, type: newType, to_account: newToAcc, category: newCat});
                    }}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                    <option value="TRANSFER">⇄ Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                    {editForm.type === 'TRANSFER' ? 'From Account' : 'Account'}
                  </label>
                  <select 
                    value={editForm.account || 'SBI'} 
                    onChange={(e) => {
                      const fromAcc = e.target.value;
                      let toAcc = editForm.to_account;
                      if (toAcc === fromAcc) {
                        toAcc = fromAcc === 'SBI' ? 'CASH' : 'SBI';
                      }
                      setEditForm({...editForm, account: fromAcc, to_account: toAcc});
                    }}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="SBI">SBI Bank</option>
                    <option value="APGB">APGB Bank</option>
                    <option value="HDFC">HDFC Bank</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>

                {editForm.type === 'TRANSFER' ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">To Account</label>
                    <select 
                      value={editForm.to_account || (editForm.account === 'SBI' ? 'CASH' : 'SBI')} 
                      onChange={(e) => setEditForm({...editForm, to_account: e.target.value})}
                      className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    >
                      {['SBI', 'APGB', 'HDFC', 'CASH'].filter(acc => acc !== editForm.account).map(acc => (
                        <option key={acc} value={acc}>
                          {acc === 'SBI' ? 'SBI Bank' : acc === 'APGB' ? 'APGB Bank' : acc === 'HDFC' ? 'HDFC Bank' : 'Cash Wallet'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
                    <select 
                      value={editForm.category || 'Other'} 
                      onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                      className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                    >
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{getCategoryEmoji(cat)} {cat}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {editForm.type === 'TRANSFER' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
                  <select 
                    value={editForm.category || 'Self Transfer'} 
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{getCategoryEmoji(cat)} {cat}</option>)}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setEditingTransaction(null)} 
                  className="px-4 py-2 bg-[#1E293B] hover:bg-[#2D3748] border border-[#232D45] rounded-xl text-sm text-gray-300 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveEdit} 
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Category Settings Modal ===== */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111827] border border-[#232D45] w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-[#232D45] px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-indigo-400" /> Category Settings
              </h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#1E293B] transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              {/* Add New Category */}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Emoji" 
                  value={newCatEmoji} 
                  onChange={(e) => setNewCatEmoji(e.target.value)}
                  className="w-16 bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-center text-lg focus:outline-none focus:border-blue-500 transition-all"
                  maxLength={2}
                />
                <input 
                  type="text" 
                  placeholder="Category name..." 
                  value={newCatName} 
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                />
                <button 
                  onClick={handleAddCategory}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {/* Category List */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">All Categories</span>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">Loading categories...</p>
                ) : (
                  categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between bg-[#1E293B]/30 hover:bg-[#1E293B]/50 border border-[#232D45] rounded-xl px-4 py-3 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{cat.emoji}</span>
                        <span className="text-sm font-medium text-white">{cat.name}</span>
                        {cat.is_default && (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-500/10 border border-gray-500/20 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                        )}
                      </div>
                      {!cat.is_default && (
                        <button 
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                          title="Delete Category"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Statement Importer Modal */}
      {showParserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#111827] border border-[#232D45] w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            
            <div className="flex items-center justify-between border-b border-[#232D45] px-6 py-4">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Import Transactions</h3>
              </div>
              <button 
                onClick={() => { 
                  setShowParserModal(false); 
                  setParsedTransactions([]); 
                  setStatementFile(null); 
                }} 
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              {parsedTransactions.length === 0 ? (
                <div className="flex flex-col gap-6">
                  
                  {/* Mode Toggle */}
                  <div className="flex bg-[#0F172A] p-1.5 rounded-xl border border-[#232D45] gap-1 max-w-md mx-auto w-full">
                    <button 
                      type="button"
                      onClick={() => setImportMode('MANUAL')}
                      className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all ${
                        importMode === 'MANUAL' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Manual Entry Grid
                    </button>
                    <button 
                      type="button"
                      onClick={() => setImportMode('FILE')}
                      className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all ${
                        importMode === 'FILE' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Upload Excel / CSV File
                    </button>
                  </div>

                  {importMode === 'FILE' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-1 bg-[#1E293B]/20 border border-[#232D45] rounded-xl p-5 flex flex-col gap-4 text-sm">
                        <h4 className="font-semibold text-white flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4 text-blue-400" /> Instructions
                        </h4>
                        <p className="text-gray-300 text-xs leading-relaxed">
                          Upload an Excel (.xlsx, .xls) or CSV (.csv) file. 
                        </p>
                        <p className="text-gray-300 text-xs leading-relaxed">
                          Your file must include headers that match these names:
                        </p>
                        <div className="bg-[#0F172A] p-3 rounded-lg border border-[#232D45] font-mono text-[11px] text-gray-300 flex flex-col gap-1">
                          <div><strong>date</strong> (YYYY-MM-DD or DD-MM-YYYY)</div>
                          <div><strong>category</strong> (Food, Utilities, Salary, etc.)</div>
                          <div><strong>credit</strong> (monetary amount for income)</div>
                          <div><strong>debit</strong> (monetary amount for expense)</div>
                          <div><strong>description</strong> (optional text)</div>
                        </div>
                      </div>

                      <div className="md:col-span-2 flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Target Bank Account</label>
                            <select 
                              value={statementAccount} 
                              onChange={(e) => setStatementAccount(e.target.value)}
                              className="w-full bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                            >
                              <option value="SBI">SBI Bank Account</option>
                              <option value="APGB">APGB Bank Account</option>
                              <option value="HDFC">HDFC Bank Account</option>
                              <option value="CASH">Cash / Wallet</option>
                            </select>
                          </div>
                        </div>

                        <div className="border border-dashed border-[#232D45] bg-[#0F172A]/50 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
                          <Upload className="h-8 w-8 text-gray-500" />
                          <div>
                            <label className="cursor-pointer bg-[#1E293B] hover:bg-[#2D3748] text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all inline-block">
                              Select Excel or CSV File
                              <input 
                                type="file" 
                                accept=".csv,.xlsx,.xls" 
                                className="hidden" 
                                onChange={(e) => setStatementFile(e.target.files[0])}
                              />
                            </label>
                            <p className="text-[10px] text-gray-500 mt-2">Supports CSV, XLSX, and XLS formats</p>
                          </div>
                          {statementFile && (
                            <div className="bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs px-3.5 py-1.5 rounded-lg font-medium mt-1">
                              Selected: {statementFile.name} ({(statementFile.size / 1024).toFixed(1)} KB)
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <button 
                            onClick={() => {
                              setShowParserModal(false);
                              setStatementFile(null);
                            }}
                            className="bg-[#1E293B] hover:bg-[#2D3748] px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleParseStatement}
                            className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 text-white"
                            disabled={loading}
                          >
                            {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                            Upload & Parse File
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Manual Entry Grid Mode */
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 mb-1">Target Bank Account</label>
                          <select 
                            value={statementAccount} 
                            onChange={(e) => setStatementAccount(e.target.value)}
                            className="bg-[#0F172A] border border-[#232D45] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                          >
                            <option value="SBI">SBI Bank Account</option>
                            <option value="APGB">APGB Bank Account</option>
                            <option value="HDFC">HDFC Bank Account</option>
                            <option value="CASH">Cash / Wallet</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setManualRows([{ date: new Date().toISOString().split('T')[0], category: 'Other', description: '', credit: '', debit: '' }])}
                            className="bg-[#1E293B] hover:bg-red-950/40 text-gray-400 hover:text-red-400 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-[#232D45]"
                          >
                            Clear All
                          </button>
                          <button 
                            onClick={handleAddManualRow}
                            className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-blue-500/20"
                          >
                            + Add Row
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-[#232D45] max-h-80">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-[#1E293B]/60 text-gray-400 font-semibold border-b border-[#232D45]">
                              <th className="px-3 py-2 text-xs uppercase w-32">Date</th>
                              <th className="px-3 py-2 text-xs uppercase w-36">Category</th>
                              <th className="px-3 py-2 text-xs uppercase w-48">Description</th>
                              <th className="px-3 py-2 text-xs uppercase w-28">Debit (Expense)</th>
                              <th className="px-3 py-2 text-xs uppercase w-28">Credit (Income)</th>
                              <th className="px-3 py-2 text-xs text-center uppercase w-14">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#232D45] bg-[#161D30]/10">
                            {manualRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-[#1E293B]/20 transition-all">
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="date" 
                                    value={row.date} 
                                    onChange={(e) => handleUpdateManualRow(idx, 'date', e.target.value)}
                                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select 
                                    value={row.category} 
                                    onChange={(e) => handleUpdateManualRow(idx, 'category', e.target.value)}
                                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                                  >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="text" 
                                    placeholder="Particulars..."
                                    value={row.description} 
                                    onChange={(e) => handleUpdateManualRow(idx, 'description', e.target.value)}
                                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="number" 
                                    placeholder="Debit amount"
                                    value={row.debit} 
                                    disabled={!!row.credit}
                                    onChange={(e) => handleUpdateManualRow(idx, 'debit', e.target.value)}
                                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-30"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="number" 
                                    placeholder="Credit amount"
                                    value={row.credit} 
                                    disabled={!!row.debit}
                                    onChange={(e) => handleUpdateManualRow(idx, 'credit', e.target.value)}
                                    className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-30"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button 
                                    onClick={() => handleDeleteManualRow(idx)}
                                    className="text-gray-400 hover:text-red-500 p-1 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button 
                          onClick={() => setShowParserModal(false)}
                          className="bg-[#1E293B] hover:bg-[#2D3748] px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleParseStatement}
                          className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all text-white"
                        >
                          Process & Review
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="bg-blue-600/10 border border-blue-500/20 text-blue-400 p-3.5 rounded-xl text-xs flex items-center justify-between">
                    <span>Parsed <strong>{parsedTransactions.length}</strong> transactions. Please review, edit, or remove lines before import.</span>
                    <button 
                      onClick={() => setParsedTransactions([])} 
                      className="text-blue-400 hover:text-white underline font-semibold"
                    >
                      Clear & Back
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#232D45] max-h-96">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#1E293B]/60 text-gray-400 font-semibold border-b border-[#232D45]">
                          <th className="px-3 py-2.5 text-xs uppercase w-32">Date</th>
                          <th className="px-3 py-2.5 text-xs uppercase w-48">Description</th>
                          <th className="px-3 py-2.5 text-xs uppercase w-32">Amount</th>
                          <th className="px-3 py-2.5 text-xs uppercase w-32">Type</th>
                          <th className="px-3 py-2.5 text-xs uppercase w-36">Category</th>
                          <th className="px-3 py-2.5 text-xs text-center uppercase w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232D45] bg-[#161D30]/10">
                        {parsedTransactions.map((tx, idx) => (
                          <tr key={idx} className="hover:bg-[#1E293B]/20 transition-all">
                            <td className="px-3 py-2">
                              <input 
                                type="date" 
                                value={tx.date} 
                                onChange={(e) => handleUpdateParsedRow(idx, 'date', e.target.value)}
                                className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input 
                                type="text" 
                                value={tx.description} 
                                onChange={(e) => handleUpdateParsedRow(idx, 'description', e.target.value)}
                                className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input 
                                type="number" 
                                step="0.01"
                                value={tx.amount} 
                                onChange={(e) => handleUpdateParsedRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                                className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select 
                                value={tx.type} 
                                onChange={(e) => handleUpdateParsedRow(idx, 'type', e.target.value)}
                                className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white"
                              >
                                <option value="EXPENSE">Expense</option>
                                <option value="INCOME">Income</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select 
                                value={tx.category} 
                                onChange={(e) => handleUpdateParsedRow(idx, 'category', e.target.value)}
                                className="w-full bg-[#0F172A] border border-[#232D45] rounded-lg px-2 py-1 text-xs text-white"
                              >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button 
                                onClick={() => handleDeleteParsedRow(idx)}
                                className="text-gray-400 hover:text-red-500 p-1 rounded-lg transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-[#232D45]">
                    <button 
                      onClick={() => setParsedTransactions([])}
                      className="bg-[#1E293B] hover:bg-[#2D3748] px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleImportParsed}
                      className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 text-white"
                      disabled={loading}
                    >
                      {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                      Import {parsedTransactions.length} Transactions
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
