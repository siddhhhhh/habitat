'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { RealtimeEvents } from '@/lib/realtimeEvents';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Visitor } from '@/types';
import { apiService } from '@/services/api';
import { Plus, Search, UserCheck, Clock, CheckCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function VisitorsPage() {
  const { hasPermission } = useAuth();
  const { on: subscribeRealtime } = useRealtime();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    flatNumber: '',
    vehicle: '',
    purpose: '',
  });

  useEffect(() => {
    if (!hasPermission('visitors:read')) return;
    fetchVisitors();
  }, []);

  // Refresh when security/admin logs a visitor in or checks one out.
  useEffect(() => {
    const off = subscribeRealtime(RealtimeEvents.VisitorAlert, () => fetchVisitors());
    return () => off();
  }, [subscribeRealtime]);

  const fetchVisitors = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getVisitors();
// @ts-ignore
    setVisitors(Array.isArray(response) ? response : (response as any).data || []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch visitors');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createVisitor(formData);
      toast.success('Visitor logged successfully');
      setShowCreateModal(false);
      resetForm();
      fetchVisitors();
    } catch (error) {
      toast.error('Failed to log visitor');
    }
  };

  const handleCheckoutVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitor) return;
    try {
      await apiService.checkoutVisitor(selectedVisitor._id);
      toast.success('Visitor checked out successfully');
      setShowCheckoutModal(false);
      setSelectedVisitor(null);
      fetchVisitors();
    } catch (error) {
      toast.error('Failed to checkout visitor');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', flatNumber: '', vehicle: '', purpose: '' });
  };

  const openCheckoutModal = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setShowCheckoutModal(true);
  };

  const filteredVisitors = (visitors || []).filter((visitor) => {
    const matchesSearch =
      visitor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visitor.flatNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'active' && !visitor.outTime) ||
      (statusFilter === 'checked_out' && visitor.outTime);

    return matchesSearch && matchesStatus;
  });

  const getVisitorStatus = (visitor: Visitor) => (visitor.outTime ? 'checked_out' : 'active');

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'warning';
      case 'checked_out':
        return 'success';
      default:
        return 'default';
    }
  };

  if (!hasPermission('visitors:read')) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Visitors</h1>
          {hasPermission('visitors:write') && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Log Visitor
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Total Visitors</p>
                <p className="text-2xl font-bold">{visitors.length}</p>
              </div>
              <UserCheck className="w-8 h-8 text-blue-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Active Visitors</p>
                <p className="text-2xl font-bold">{visitors.filter((v) => !v.outTime).length}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Checked Out</p>
                <p className="text-2xl font-bold">{visitors.filter((v) => v.outTime).length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="relative flex-1">
              <Input
                placeholder="Search visitors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Visitors ({filteredVisitors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Flat</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>In Time</TableHead>
                    <TableHead>Out Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisitors.map((v) => (
                    <TableRow key={v._id}>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.flatNumber || '-'}</TableCell>
                      <TableCell>{v.purpose}</TableCell>
                      <TableCell>{v.vehicle || '-'}</TableCell>
                      <TableCell>{formatDateTime(v.inTime)}</TableCell>
                      <TableCell>{v.outTime ? formatDateTime(v.outTime) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(getVisitorStatus(v))}>
                          {getVisitorStatus(v).replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!v.outTime && hasPermission('visitors:write') && (
                          <Button variant="outline" size="sm" onClick={() => openCheckoutModal(v)}>
                            Checkout
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Log New Visitor">
        <form onSubmit={handleCreateVisitor} className="space-y-4">
          <Input
            label="Visitor Name"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <Input
            label="Flat Number"
            value={formData.flatNumber}
            onChange={(e) => setFormData((p) => ({ ...p, flatNumber: e.target.value }))}
            required
          />
          <Input
            label="Vehicle"
            value={formData.vehicle}
            onChange={(e) => setFormData((p) => ({ ...p, vehicle: e.target.value }))}
          />
          <Input
            label="Purpose"
            value={formData.purpose}
            onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}
            required
          />
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit">Log Visitor</Button>
          </div>
        </form>
      </Modal>

      {/* Checkout Modal */}
      <Modal isOpen={showCheckoutModal} onClose={() => setShowCheckoutModal(false)} title="Checkout Visitor">
        {selectedVisitor && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p><strong>Name:</strong> {selectedVisitor.name}</p>
              <p><strong>Flat:</strong> {selectedVisitor.flatNumber}</p>
              <p><strong>Purpose:</strong> {selectedVisitor.purpose}</p>
              <p><strong>In Time:</strong> {formatDateTime(selectedVisitor.inTime)}</p>
            </div>
            <form onSubmit={handleCheckoutVisitor}>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCheckoutModal(false)}>Cancel</Button>
                <Button type="submit">Checkout</Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
