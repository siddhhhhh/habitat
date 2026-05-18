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
import { Badge } from '@/components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Booking, Amenity, Technician, BookingStatus } from '@/types';
import { apiService } from '@/services/api';
import { Plus, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function BookingsPage() {
  const { user, hasPermission } = useAuth();
  const { on: subscribeRealtime } = useRealtime();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAmenity, setSelectedAmenity] = useState('');

  useEffect(() => {
    if (!hasPermission('bookings:read')) return;
    fetchAllData();
  }, []);

  // Refresh when staff approve/reject (resident sees the decision)
  // or when a resident creates a new booking (staff sees it appear).
  useEffect(() => {
    const off = subscribeRealtime(RealtimeEvents.BookingDecision, () => fetchAllData());
    return () => off();
  }, [subscribeRealtime]);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      const [bookingsRes, amenitiesRes, techRes] = await Promise.all([
        apiService.getBookings(),
        apiService.getAmenities(),
        apiService.getTechnicians(),
      ]);

      setBookings(bookingsRes || []);
      setAmenities(amenitiesRes?.data || []);
      setTechnicians(techRes || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Unified Status Update (Admin)
  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    try {
      await apiService.approveBooking(id, status);
      toast.success(`Booking ${status}`);
      fetchAllData();
    } catch (error) {
      toast.error('Failed to update booking status');
    }
  };

  // ✅ Resident: Create New Booking
  // In BookingsPage component (frontend)
const handleCreateBooking = async () => {
  if (!selectedAmenity) {
    toast.error('Please select an amenity first');
    return;
  }

  try {
    const newBooking = {
      amenityId: selectedAmenity,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      // ❌ Don't send userId - it will be extracted from JWT token
    };

    await apiService.createBooking(newBooking);
    toast.success('Booking created successfully!');
    fetchAllData();
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Failed to create booking');
  }
};


  // ✅ Filters
  const filteredBookings = bookings.filter((booking) => {
    const amenityName = (booking.amenityId as any)?.name?.toLowerCase() || '';
    const userName = (booking.userId as any)?.name?.toLowerCase() || '';
    const matchesSearch =
      amenityName.includes(searchTerm.toLowerCase()) ||
      userName.includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: BookingStatus.PENDING, label: 'Pending' },
    { value: BookingStatus.APPROVED, label: 'Approved' },
    { value: BookingStatus.REJECTED, label: 'Rejected' },
    { value: BookingStatus.CANCELLED, label: 'Cancelled' },
  ];

  const getStatusBadgeVariant = (status: BookingStatus) => {
    switch (status) {
      case BookingStatus.PENDING:
        return 'warning';
      case BookingStatus.APPROVED:
        return 'success';
      case BookingStatus.REJECTED:
        return 'danger';
      case BookingStatus.CANCELLED:
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: BookingStatus) => {
    switch (status) {
      case BookingStatus.PENDING:
        return <Clock className="w-4 h-4" />;
      case BookingStatus.APPROVED:
        return <CheckCircle className="w-4 h-4" />;
      case BookingStatus.REJECTED:
        return <XCircle className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  if (!hasPermission('bookings:read')) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You don't have permission to view this page.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>

          {/* ✅ Admin sees nothing here; Resident sees New Booking section */}
          {user?.role === 'resident' && (
            <div className="flex space-x-2">
              <select
                className="border rounded px-3 py-2"
                value={selectedAmenity}
                onChange={(e) => setSelectedAmenity(e.target.value)}
              >
                <option value="">Select Amenity</option>
                {amenities.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <Button onClick={handleCreateBooking}>
                <Plus className="w-4 h-4 mr-2" /> New Booking
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusOptions}
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Bookings ({filteredBookings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              </div>
            ) : filteredBookings.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No bookings found
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amenity</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell>
                        {(booking.userId as any)?.name || '—'}
                      </TableCell>
                      <TableCell>
                        {(booking.amenityId as any)?.name || '—'}
                      </TableCell>
                      <TableCell>{formatDateTime(booking.startTime)}</TableCell>
                      <TableCell>{formatDateTime(booking.endTime)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(booking.status)}>
                          <div className="flex items-center space-x-1">
                            {getStatusIcon(booking.status)}
                            <span>{booking.status}</span>
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {/* Admin buttons */}
                        {booking.status === BookingStatus.PENDING &&
                          user?.role === 'admin' && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() =>
                                  handleUpdateStatus(
                                    booking._id,
                                    BookingStatus.APPROVED
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  handleUpdateStatus(
                                    booking._id,
                                    BookingStatus.REJECTED
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </>
                          )}

                        {/* Resident cancel */}
                        {booking.status === BookingStatus.APPROVED &&
                          user?.role === 'resident' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleUpdateStatus(
                                  booking._id,
                                  BookingStatus.CANCELLED
                                )
                              }
                            >
                              Cancel
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
    </Layout>
  );
}
