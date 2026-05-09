'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Bill, PaymentStatus, UserRole, User } from '@/types';
import { apiService } from '@/services/api';
import { Plus, Search, CreditCard, DollarSign, Calendar, Download, RefreshCcw } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function BillsPage() {
  const { user, hasPermission } = useAuth();

  const [bills, setBills] = useState<Bill[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const [payFormData, setPayFormData] = useState({
    amount: '',
    gatewayRef: ''
  });

  const [generateFormData, setGenerateFormData] = useState({
    billingPeriodStart: '',
    billingPeriodEnd: '',
    amount: 0,
    selectedUsers: [] as string[]
  });

  // Ensure status option values match normalized lowercase statuses
  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: (PaymentStatus.PENDING as unknown as string) || 'pending', label: 'Pending' },
    { value: (PaymentStatus.COMPLETED as unknown as string) || 'completed', label: 'Completed' },
    { value: (PaymentStatus.FAILED as unknown as string) || 'failed', label: 'Failed' },
    { value: (PaymentStatus.REFUNDED as unknown as string) || 'refunded', label: 'Refunded' }
  ];

  // ---------------- Fetch on mount ----------------
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        setIsLoading(true);

        const billsFilter = (user.role === UserRole.ADMIN || user.role === UserRole.COMMITTEE)
          ? {}
          : { userId: user._id };

        const res = await apiService.getBills(billsFilter) as Bill[]; // type assertion to Bill[]
        console.log('📦 Bills data from backend:', res);
        console.log('🧾 Bill statuses:', res.map(b => b.status));

        // Normalize: set default and convert to lowercase
        const normalized: Bill[] = res.map((b: any) => ({
          ...b,
          status: (b.status?.toLowerCase?.() || 'pending') as PaymentStatus,
          user: b.user || { name: 'Unknown', flatNumber: '-' }
        }));
        setBills(normalized);


        setBills(normalized);

        if (user.role === UserRole.ADMIN || user.role === UserRole.COMMITTEE) {
          const usersResp = await apiService.getUsers();
          setUsers(usersResp.data || []);
        }
      } catch (err) {
        console.error('❌ Failed to fetch bills:', err);
        toast.error('Failed to load bills');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // ✅ Separate function for refetching
  const fetchBills = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      const billsFilter = (user.role === UserRole.ADMIN || user.role === UserRole.COMMITTEE)
        ? {}
        : { userId: user._id };

      const res = await apiService.getBills(billsFilter);
      const data = Array.isArray(res) ? res : [];

      const normalized: Bill[] = res.map((b: any) => ({
        ...b,
        status: (b.status?.toLowerCase?.() || 'pending') as PaymentStatus,
        user: b.user || { name: 'Unknown', flatNumber: '-' }
      }));
      setBills(normalized);


      console.log('📦 Refetched bills:', normalized);
      setBills(normalized);
    } catch (err) {
      console.error('❌ Failed to fetch bills:', err);
      toast.error('Failed to load bills');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------- Payment ----------------
  const openPayModal = (bill: Bill) => {
    setSelectedBill(bill);
    setPayFormData({
      amount: bill.amount?.toString() ?? '',
      gatewayRef: ''
    });
    setShowPayModal(true);
  };

  const loadRazorpaySdk = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('Window unavailable'));
      if ((window as any).Razorpay) return resolve();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
      document.body.appendChild(script);
    });

  const handleRazorpayPay = async (bill: Bill) => {
    try {
      const resp = await apiService.checkoutBill(bill._id);
      if (!resp.success) throw new Error(resp.message || 'Checkout failed');
      const { keyId, orderId, amount, currency } = resp.data;

      await loadRazorpaySdk();
      const rzp = new (window as any).Razorpay({
        key: keyId,
        order_id: orderId,
        amount,
        currency,
        name: 'Habitat Society',
        description: bill.description,
        handler: () => {
          toast.success('Payment received — confirming…');
          setTimeout(fetchBills, 2000);
        },
        modal: { ondismiss: fetchBills },
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#3b82f6' },
      });
      rzp.open();
    } catch (err: any) {
      if (err.response?.status === 503) {
        toast('Razorpay not configured — using manual entry.', { icon: 'ℹ️' });
        openPayModal(bill);
        return;
      }
      console.error('❌ Razorpay checkout error:', err);
      toast.error('Could not start checkout');
    }
  };

  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    try {
      await apiService.payBill(selectedBill._id, Number(payFormData.amount), payFormData.gatewayRef);
      toast.success('Payment processed successfully');
      setShowPayModal(false);
      fetchBills();
    } catch (err) {
      console.error('❌ Payment error:', err);
      toast.error('Failed to process payment');
    }
  };

  // ---------------- Generate Bills ----------------
  const resetGenerateForm = () => {
    setGenerateFormData({
      billingPeriodStart: '',
      billingPeriodEnd: '',
      amount: 0,
      selectedUsers: []
    });
  };

  const handleGenerateBills = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!generateFormData.selectedUsers.length) {
      toast.error('Select at least one resident');
      return;
    }

    try {
      const billsToGenerate = generateFormData.selectedUsers.map(userId => ({
        user: userId,
        description: `Maintenance bill for period ${generateFormData.billingPeriodStart} to ${generateFormData.billingPeriodEnd}`,
        amount: generateFormData.amount,
        dueDate: generateFormData.billingPeriodEnd
      }));

      await apiService.generateBills(billsToGenerate);

      toast.success('Bills generated successfully');
      setShowGenerateModal(false);
      resetGenerateForm();
      fetchBills();
    } catch (err) {
      console.error('❌ Generate bills error:', err);
      toast.error('Failed to generate bills');
    }
  };

  // ---------------- Filtering ----------------
  const filteredBills = bills.filter(bill => {
  const userName = bill.user?.name?.toLowerCase() || '';
  const description = bill.description?.toLowerCase() || '';
  const matchesSearch =
    description.includes(searchTerm.toLowerCase()) ||
    userName.includes(searchTerm.toLowerCase());

  const billStatus = bill.status?.toLowerCase?.() || '';
  const filterStatus = statusFilter?.toLowerCase?.() || '';
  const matchesStatus = !filterStatus || billStatus === filterStatus;

  return matchesSearch && matchesStatus;
});


  // ---------------- Helpers ----------------
  // Accept string status (normalized to lowercase)
  const getStatusBadgeVariant = (status: string | undefined) => {
    const s = (status || '').toString().toLowerCase();
    switch (s) {
      case 'pending': return 'warning';
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'refunded': return 'info';
      default: return 'default';
    }
  };

  const getTotalStats = () => {
  const totalBills = bills.length;
  const pendingBills = bills.filter(b => b.status?.toLowerCase() === 'pending').length;
  const totalAmount = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const pendingAmount = bills
    .filter(b => b.status?.toLowerCase() === 'pending')
    .reduce((sum, b) => sum + (b.amount || 0), 0);
  return { totalBills, pendingBills, totalAmount, pendingAmount };
};


  const stats = getTotalStats();

  // ---------------- Export to CSV ----------------
  const handleExport = () => {
    if (!bills.length) return toast.error('No bills to export');

    const csvContent = [
      ['User', 'Description', 'Amount', 'Due Date', 'Status'].join(','),
      ...bills.map(b => [
        `"${b.user?.name ?? 'Unknown'}"`,
        `"${b.description}"`,
        b.amount,
        formatDate(b.dueDate),
        b.status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'bills_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Bills exported successfully');
  };

  // ✅ Show loading state while user is not loaded
  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
        </div>
      </Layout>
    );
  }

  // ---------------- Render ----------------
  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={fetchBills}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            {hasPermission('bills:write') && 
 (user.role === UserRole.ADMIN || user.role === UserRole.COMMITTEE) && (
  <Button onClick={() => setShowGenerateModal(true)}>
    <Plus className="w-4 h-4 mr-2" /> Generate Bills
  </Button>
)}

            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm text-gray-600">Total Bills</p><p className="text-2xl font-bold text-gray-900">{stats.totalBills}</p></div><CreditCard className="w-8 h-8 text-blue-600"/></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm text-gray-600">Pending Bills</p><p className="text-2xl font-bold text-gray-900">{stats.pendingBills}</p></div><Calendar className="w-8 h-8 text-orange-600"/></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm text-gray-600">Total Amount</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalAmount)}</p></div><DollarSign className="w-8 h-8 text-green-600"/></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm text-gray-600">Pending Amount</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.pendingAmount)}</p></div><CreditCard className="w-8 h-8 text-red-600"/></div></CardContent></Card>
        </div>

        {/* Filters */}
        <Card><CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <Input
                placeholder="Search bills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
          </div>
        </CardContent></Card>

        {/* Bills Table */}
        <Card>
          <CardHeader><CardTitle>All Bills ({filteredBills.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
              </div>
            ) : filteredBills.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map(bill => (
                    <TableRow key={bill._id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-700">
                              {(bill.user?.name?.charAt(0) ?? '?').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{bill.user?.name ?? 'Unknown'}</p>
                            <p className="text-sm text-gray-500">{bill.user?.flatNumber ?? '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{bill.description}</TableCell>
                      <TableCell>{formatCurrency(bill.amount)}</TableCell>
                      <TableCell>{formatDate(bill.dueDate)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(bill.status)}>{(bill.status || '').toString().charAt(0).toUpperCase() + (bill.status || '').toString().slice(1)}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.role?.toString().toLowerCase() === UserRole.RESIDENT.toString().toLowerCase() &&
 (bill.status?.toString().toLowerCase() === PaymentStatus.PENDING.toString().toLowerCase()) && (
  <Button variant="outline" size="sm" onClick={() => handleRazorpayPay(bill)}>
    Pay Now
  </Button>
)}


                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-gray-500">No bills found</div>
            )}
          </CardContent>
        </Card>

        {/* Pay Modal */}
        <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Pay Bill" size="md">
          {selectedBill && (
            <form onSubmit={handlePayBill} className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Bill Details</h3>
                <p><strong>User:</strong> {selectedBill.user?.name}</p>
                <p><strong>Description:</strong> {selectedBill.description}</p>
                <p><strong>Amount:</strong> {formatCurrency(selectedBill.amount)}</p>
                <p><strong>Due Date:</strong> {formatDate(selectedBill.dueDate)}</p>
              </div>
              <Input label="Amount" type="number" value={payFormData.amount} onChange={e => setPayFormData(prev => ({ ...prev, amount: e.target.value }))} required/>
              <Input label="Gateway Reference" value={payFormData.gatewayRef} onChange={e => setPayFormData(prev => ({ ...prev, gatewayRef: e.target.value }))} required/>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" type="button" onClick={() => setShowPayModal(false)}>Cancel</Button>
                <Button type="submit">Process Payment</Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Generate Modal */}
        {hasPermission('bills:write') && (
          <Modal isOpen={showGenerateModal} onClose={() => setShowGenerateModal(false)} title="Generate Bills" size="md">
            <form onSubmit={handleGenerateBills} className="space-y-4">
              <Input label="Billing Period Start" type="date" value={generateFormData.billingPeriodStart} onChange={e => setGenerateFormData(prev => ({ ...prev, billingPeriodStart: e.target.value }))} required/>
              <Input label="Billing Period End" type="date" value={generateFormData.billingPeriodEnd} onChange={e => setGenerateFormData(prev => ({ ...prev, billingPeriodEnd: e.target.value }))} required/>
              <Input label="Amount" type="number" value={generateFormData.amount} onChange={e => setGenerateFormData(prev => ({ ...prev, amount: Number(e.target.value) }))} required/>
              <Select
                label="Select Residents"
                multiple
                options={users.map(u => ({ value: u._id, label: u.name }))}
                value={generateFormData.selectedUsers}
                onChange={(e) => {
                  const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
                  setGenerateFormData(prev => ({ ...prev, selectedUsers: selectedOptions }));
                }}
              />
              <div className="flex justify-end space-x-2">
                <Button variant="outline" type="button" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
                <Button type="submit">Generate Bills</Button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
