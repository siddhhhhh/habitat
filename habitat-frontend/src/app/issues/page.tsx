'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { RealtimeEvents } from '@/lib/realtimeEvents';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Issue, IssueStatus } from '@/types';
import { apiService } from '@/services/api';
import { Plus, Search, Edit, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function IssuesPage() {
  const { hasPermission } = useAuth();
  const { on: subscribeRealtime } = useRealtime();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [technicians, setTechnicians] = useState<{ _id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: IssueStatus.OPEN,
    images: [] as string[],
    technician: ''
  });

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: IssueStatus.OPEN, label: 'Open' },
    { value: IssueStatus.IN_PROGRESS, label: 'In Progress' },
    { value: IssueStatus.RESOLVED, label: 'Resolved' },
    { value: IssueStatus.CLOSED, label: 'Closed' }
  ];

  useEffect(() => {
    if (!hasPermission('issues:read')) return;
    fetchIssues();
    fetchTechnicians();
  }, []);

  // Refresh on backend `issue.updated` so staff see new reports and reporters
  // see status changes without a manual click.
  useEffect(() => {
    const off = subscribeRealtime(RealtimeEvents.IssueUpdated, () => fetchIssues());
    return () => off();
  }, [subscribeRealtime]);

  const fetchIssues = async () => {
    try {
      setIsLoading(true);
      const issuesList = await apiService.getIssues();
      setIssues(issuesList);
    } catch (error) {
      toast.error('Failed to fetch issues');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTechnicians = async () => {
    try {
      const techList = await apiService.getTechnicians();
      setTechnicians(techList);
    } catch (error) {
      console.error('Failed to fetch technicians');
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createIssue({
        title: formData.title,
        description: formData.description,
        images: formData.images,
        technician: formData.technician
      });
      toast.success('Issue created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchIssues();
    } catch (error) {
      toast.error('Failed to create issue');
    }
  };

  const handleEditIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue) return;
    try {
      await apiService.updateIssue(selectedIssue._id, {
        ...formData,
        technician: formData.technician
      });
      toast.success('Issue updated successfully');
      setShowEditModal(false);
      setSelectedIssue(null);
      resetForm();
      fetchIssues();
    } catch (error) {
      toast.error('Failed to update issue');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      status: IssueStatus.OPEN,
      images: [],
      technician: ''
    });
  };

  const openEditModal = (issue: Issue) => {
    setSelectedIssue(issue);
    setFormData({
      title: issue.title,
      description: issue.description,
      status: issue.status,
      images: issue.images || [],
      technician: issue.technician?._id || ''
    });
    setShowEditModal(true);
  };

  const filteredIssues = (issues || []).filter(issue => {
    const matchesSearch =
      issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || issue.status === statusFilter;
    const hideClosed = issue.status !== IssueStatus.CLOSED;
    return matchesSearch && matchesStatus && hideClosed;
  });

  const getStatusBadgeVariant = (status: IssueStatus) => {
    switch (status) {
      case IssueStatus.OPEN: return 'warning';
      case IssueStatus.IN_PROGRESS: return 'info';
      case IssueStatus.RESOLVED: return 'success';
      case IssueStatus.CLOSED: return 'default';
      default: return 'default';
    }
  };

  if (!hasPermission('issues:read')) {
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
          <h1 className="text-2xl font-bold text-gray-900">Issues</h1>
          {hasPermission('issues:write') && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" /> Report Issue
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Input
                  placeholder="Search issues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusOptions}
              />
            </div>
          </CardContent>
        </Card>

        {/* Issues Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Issues ({filteredIssues.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reporter</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map((issue) => (
                    <TableRow key={issue._id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className="w-5 h-5 text-orange-500" />
                          <div>
                            <p className="font-medium text-gray-900">{issue.title}</p>
                            {issue.images && issue.images.length > 0 && (
                              <p className="text-sm text-gray-500">{issue.images.length} image(s)</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-gray-600 max-w-xs truncate">{issue.description}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-900">{issue.reporter?.name || 'Unassigned'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-900">{issue.technician?.name || 'Unassigned'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(issue.status)}>
                          {issue.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{formatDate(issue.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => openEditModal(issue)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Issue Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Report New Issue" size="lg">
        <form onSubmit={handleCreateIssue} className="space-y-4">
          <Input
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Brief description of the issue"
            required
          />
          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Detailed description of the issue"
            rows={4}
            required
          />
          <Select
            label="Assign To"
            value={formData.technician}
            onChange={(e) => setFormData(prev => ({ ...prev, technician: e.target.value }))}
            options={[
              { value: '', label: 'Unassigned' },
              ...(technicians || []).map(t => ({ value: t._id, label: t.name }))
            ]}
          />
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit">Report Issue</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Issue Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Issue" size="lg">
        <form onSubmit={handleEditIssue} className="space-y-4">
          <Input
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            required
          />
          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={4}
            required
          />
          <Select
            label="Assign To"
            value={formData.technician}
            onChange={(e) => setFormData(prev => ({ ...prev, technician: e.target.value }))}
            options={[
              { value: '', label: 'Unassigned' },
              ...(technicians || []).map(t => ({ value: t._id, label: t.name }))
            ]}
          />
          <Select
            label="Status"
            value={formData.status}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as IssueStatus }))}
            options={statusOptions.filter(option => option.value !== '')}
          />
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button type="submit">Update Issue</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
