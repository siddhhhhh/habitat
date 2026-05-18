'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { RealtimeEvents } from '@/lib/realtimeEvents';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Notice, UserRole } from '@/types';
import { apiService } from '@/services/api';
import { Plus, Edit, Trash2, Bell, Pin } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function NoticesPage() {
  const { user, hasPermission } = useAuth();
  const { on: subscribeRealtime } = useRealtime();

  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    visibleFrom: string;
    visibleUntil: string;
    pinned: boolean;
    audience: UserRole[];
  }>({
    title: '',
    description: '',
    visibleFrom: '',
    visibleUntil: '',
    pinned: false,
    audience: [],
  });

  const audienceOptions = [
    { value: UserRole.ADMIN, label: 'Admin' },
    { value: UserRole.COMMITTEE, label: 'Committee' },
    { value: UserRole.RESIDENT, label: 'Member' },
    { value: UserRole.TENANT, label: 'Tenant' },
    { value: UserRole.SECURITY, label: 'Security' },
    { value: UserRole.TECHNICIAN, label: 'Technician' },
  ];

  useEffect(() => {
    if (!hasPermission('notices:read')) return;
    fetchNotices();
  }, []);

  // Live refresh when a committee/admin user publishes a notice elsewhere.
  // The provider already toasts "New notice"; here we just keep the list fresh.
  useEffect(() => {
    const off = subscribeRealtime(RealtimeEvents.NoticeCreated, () => fetchNotices());
    return () => off();
  }, [subscribeRealtime]);

  const fetchNotices = async () => {
  try {
    setIsLoading(true);
    const response = await apiService.getNotices();
    console.log('Fetched notices:', response); // should log { data: [ ... ] }
    setNotices(response.data || []);
  } catch (error) {
    toast.error('Failed to fetch notices');
  } finally {
    setIsLoading(false);
  }
};


  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createNotice(formData);
      toast.success('Notice created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchNotices();
    } catch (error) {
      toast.error('Failed to create notice');
    }
  };

  const handleEditNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNotice) return;
    try {
      await apiService.updateNotice(selectedNotice._id, formData);
      toast.success('Notice updated successfully');
      setShowEditModal(false);
      setSelectedNotice(null);
      resetForm();
      fetchNotices();
    } catch (error) {
      toast.error('Failed to update notice');
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm('Are you sure you want to delete this notice?')) return;
    try {
      await apiService.deleteNotice(noticeId);
      toast.success('Notice deleted successfully');
      fetchNotices();
    } catch (error) {
      toast.error('Failed to delete notice');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      visibleFrom: '',
      visibleUntil: '',
      pinned: false,
      audience: [],
    });
  };

  const openEditModal = (notice: Notice) => {
    setSelectedNotice(notice);
    setFormData({
      title: notice.title,
      description: notice.description,
      visibleFrom: notice.visibleFrom.split('T')[0],
      visibleUntil: notice.visibleUntil.split('T')[0],
      pinned: notice.pinned,
      audience: notice.audience,
    });
    setShowEditModal(true);
  };

  const filteredNotices = (notices || []).filter(notice =>
  notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
  notice.description.toLowerCase().includes(searchTerm.toLowerCase())
);


  const isNoticeActive = (notice: Notice) => {
    const now = new Date();
    const visibleFrom = new Date(notice.visibleFrom);
    const visibleUntil = new Date(notice.visibleUntil);
    return now >= visibleFrom && now <= visibleUntil;
  };

  if (!hasPermission('notices:read')) {
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
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Notices</h1>
          {hasPermission('notices:write') && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Notice
            </Button>
          )}
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <Input
              placeholder="Search notices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Notices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            filteredNotices.map(notice => (
              <Card key={notice._id} className="relative">
                {notice.pinned && (
                  <div className="absolute top-4 right-4">
                    <Pin className="w-4 h-4 text-primary-600" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{notice.title}</CardTitle>
                    <Badge variant={isNoticeActive(notice) ? 'success' : 'default'}>
                      {isNoticeActive(notice) ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4 line-clamp-3">{notice.description}</p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <div className="flex items-center space-x-2">
                      <Bell className="w-4 h-4" />
                      <span>Visible: {formatDate(notice.visibleFrom)} - {formatDate(notice.visibleUntil)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span>Audience: {notice.audience.join(', ')}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span>Created: {formatDateTime(notice.createdAt)}</span>
                    </div>
                  </div>

                  {hasPermission('notices:write') && (
                    <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-200">
                      <Button variant="outline" size="sm" onClick={() => openEditModal(notice)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteNotice(notice._id)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {filteredNotices.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-12 text-center">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No notices found</h3>
              <p className="text-gray-600">Create your first notice to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create & Edit Modals */}
      <NoticeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateNotice}
        formData={formData}
        setFormData={setFormData}
        audienceOptions={audienceOptions}
        title="Create Notice"
      />

      <NoticeModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleEditNotice}
        formData={formData}
        setFormData={setFormData}
        audienceOptions={audienceOptions}
        title="Edit Notice"
      />
    </Layout>
  );
}

// ---------------- NoticeModal Component ----------------
interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: {
    title: string;
    description: string;
    visibleFrom: string;
    visibleUntil: string;
    pinned: boolean;
    audience: UserRole[];
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    visibleFrom: string;
    visibleUntil: string;
    pinned: boolean;
    audience: UserRole[];
  }>>;
  audienceOptions: { value: UserRole; label: string }[];
  title: string;
}

function NoticeModal({ isOpen, onClose, onSubmit, formData, setFormData, audienceOptions, title }: NoticeModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Title"
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Enter notice title"
          required
        />

        <Textarea
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter notice description"
          rows={4}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Visible From"
            type="date"
            value={formData.visibleFrom}
            onChange={(e) => setFormData(prev => ({ ...prev, visibleFrom: e.target.value }))}
            required
          />
          <Input
            label="Visible Until"
            type="date"
            value={formData.visibleUntil}
            onChange={(e) => setFormData(prev => ({ ...prev, visibleUntil: e.target.value }))}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Audience</label>
          <div className="grid grid-cols-2 gap-2">
            {audienceOptions.map((option) => (
              <label key={option.value} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.audience.includes(option.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, audience: [...prev.audience, option.value] }));
                    } else {
                      setFormData(prev => ({ ...prev, audience: prev.audience.filter(aud => aud !== option.value) }));
                    }
                  }}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="pinned"
            checked={formData.pinned}
            onChange={(e) => setFormData(prev => ({ ...prev, pinned: e.target.checked }))}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="pinned" className="text-sm font-medium text-gray-700">Pin this notice</label>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{title.includes('Create') ? 'Create' : 'Update'} Notice</Button>
        </div>
      </form>
    </Modal>
  );
}
