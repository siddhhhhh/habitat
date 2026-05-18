import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';
import {
  ApiResponse,
  PaginatedResponse,
  User,
  AuthResponse,
  Issue,
  Visitor,
  Bill,
  Payment,
  Notice,
  Amenity,
  Booking,
  Technician,
  PaymentStatus
} from '@/types';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || ' https://seproject-5q98.onrender.com/api'|| 'http://localhost:5000/api',
      timeout: 60000,
    });

    // Attach auth token to all requests
    this.api.interceptors.request.use((config) => {
      const token = Cookies.get('accessToken');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Handle 401 and token refresh
    this.api.interceptors.response.use(
      (res) => res,
      async (error) => {
        const originalRequest = error.config;
        const url: string = originalRequest?.url ?? '';
        const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true;
          try {
            const refreshToken = Cookies.get('refreshToken');
            if (!refreshToken) throw new Error('No refresh token found');
            const resp = await axios.post(`${this.api.defaults.baseURL}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: nextRefresh } = resp.data.data;
            Cookies.set('accessToken', accessToken, { expires: 1 });
            if (nextRefresh) Cookies.set('refreshToken', nextRefresh, { expires: 30 });
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.api(originalRequest);
          } catch {
            Cookies.remove('accessToken');
            Cookies.remove('refreshToken');
            if (typeof window !== 'undefined') window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // ---------------- Auth ----------------
  login(email: string, password: string) {
    return this.api.post<AuthResponse>('/auth/login', { email, password }).then(res => res.data);
  }

  register(userData: {
    email: string;
    password: string;
    name: string;
    role: string;
    flatNumber?: string;
    building?: string;
    occupantsCount?: number;
    profile?: string;
  }) {
    return this.api.post<AuthResponse>('/auth/register', userData).then(res => res.data);
  }

  logout() {
    const refreshToken = Cookies.get('refreshToken');
    if (refreshToken) this.api.post('/auth/logout', { refreshToken });
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
    return Promise.resolve();
  }

  // ---------------- Users ----------------
  createUser(data: {
  name: string;
  email: string;
  phone?: string;
  role: string;
  flatNumber?: string;
}) {
  return this.api.post<ApiResponse<User>>('/users', data).then(res => res.data);
}

  getUsers() {
    return this.api.get<PaginatedResponse<User>>('/users').then(res => res.data);
  }

  getUserById(id: string) {
    return this.api.get<ApiResponse<User>>(`/users/${id}`).then(res => res.data);
  }

  updateUser(id: string, data: Partial<User>) {
  return this.api.put<ApiResponse<User>>(`/users/${id}`, data)
    .then(res => res.data);
}


  deleteUser(id: string) {
    return this.api.delete<ApiResponse<null>>(`/users/${id}`).then(res => res.data);
  }

 // ---------------- Issues ----------------
 
getIssues(params?: { status?: string; reporter?: string; page?: number; limit?: number }) {
  return this.api
    .get<PaginatedResponse<Issue>>('/issues', { params })
    .then(res => res.data.data); // unwrap the 'data' key
}

getIssueById(id: string) {
  return this.api
    .get<ApiResponse<Issue>>(`/issues/${id}`)
    .then(res => res.data.data); // unwrap
}

// Allow technician field here
createIssue(data: { title: string; description: string; images?: string[]; technician?: string }) {
  return this.api
    .post<ApiResponse<Issue>>('/issues', data)
    .then(res => res.data.data); // unwrap
}

// Make updateIssue partial and include technician
updateIssue(id: string, data: Partial<{ 
  title: string; 
  description: string; 
  images?: string[]; 
  status?: string; 
  technician?: string 
}>) {
  return this.api
    .patch<ApiResponse<Issue>>(`/issues/${id}`, data)
    .then(res => res.data.data);
}

deleteIssue(id: string) {
  return this.api
    .delete<ApiResponse<null>>(`/issues/${id}`)
    .then(res => res.data); // unwrap
}

  // ---------------- Notices ----------------
  getNotices(params?: { audience?: string; pinned?: boolean; page?: number; limit?: number }) {
    return this.api.get<PaginatedResponse<Notice>>('/notices', { params }).then(res => res.data);
  }

  getNoticeById(id: string) {
    return this.api.get<ApiResponse<Notice>>(`/notices/${id}`).then(res => res.data);
  }

  createNotice(data: Partial<Notice>) {
    return this.api.post<ApiResponse<Notice>>('/notices', data).then(res => res.data);
  }

  updateNotice(id: string, data: Partial<Notice>) {
    return this.api.patch<ApiResponse<Notice>>(`/notices/${id}`, data).then(res => res.data);
  }

  deleteNotice(id: string) {
    return this.api.delete<ApiResponse<null>>(`/notices/${id}`).then(res => res.data);
  }

// ---------------- Bills ----------------
// ---------------- Bills ----------------
getBills(params?: { userId?: string; status?: string; page?: number; limit?: number }) {
  return this.api.get<ApiResponse<Bill[]>>('/bills', { params })
    .then(res => res.data.data); // ✅ Now consistent with backend
}

getBillById(id: string) {
  return this.api.get<ApiResponse<Bill>>(`/bills/${id}`)
    .then(res => res.data.data); // ✅ Unwrap
}


createBill(data: {
  user: string;
  description: string;
  amount: number;
  dueDate: string;
}) {
  return this.api.post<ApiResponse<Bill>>('/bills', data).then(res => res.data);
}

updateBill(id: string, data: Partial<{
  description: string;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
}>) {
  return this.api.put<ApiResponse<Bill>>(`/bills/${id}`, data).then(res => res.data);
}

deleteBill(id: string) {
  return this.api.delete<ApiResponse<null>>(`/bills/${id}`).then(res => res.data);
}

payBill(billId: string, amount: number, gatewayRef: string) {
  return this.api.patch<ApiResponse<Bill>>(`/bills/${billId}/pay`, { amount, gatewayRef }).then(res => res.data);
}

checkoutBill(billId: string) {
  return this.api.post<ApiResponse<{
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    billId: string;
  }>>(`/bills/${billId}/checkout`).then(res => res.data);
}

generateBills(data: Array<{
  user: string;
  description: string;
  amount: number;
  dueDate: string;
}>) {
  return this.api.post<ApiResponse<Bill[]>>('/bills/generate', data).then(res => res.data);
}


  // ---------------- Payments ----------------
async getPayments(params?: {
  userId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Payment>> {
  try {
    const response = await this.api.get('/payments', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    throw error;
  }
}


  // ---------------- Amenities ----------------
  getAmenities() {
    return this.api.get<ApiResponse<Amenity[]>>('/amenities').then(res => res.data);
  }

  createAmenity(data: { name: string; description: string; capacity: number; rules: string[] }) {
    return this.api.post<ApiResponse<Amenity>>('/amenities', data).then(res => res.data);
  }

  updateAmenity(id: string, data: Partial<Amenity>) {
  return this.api
    .put<ApiResponse<Amenity>>(`/amenities/${id}`, data)
    .then(res => res.data);
}


  deleteAmenity(id: string) {
    return this.api.delete<ApiResponse<null>>(`/amenities/${id}`).then(res => res.data);
  }

 // ---------------- Bookings ----------------
getBookings(params?: any) {
  return this.api
    .get<ApiResponse<Booking[]>>('/bookings', { params })
    .then(res => res.data.data); // ✅ unwrap here
}

createBooking(data: { amenityId: string; startTime: string; endTime: string; technicianId?: string }) {
  return this.api.post<Booking>('/bookings', data)
    .then(res => res.data); // single object ✅
}

updateBooking(id: string, data: Partial<Booking>) {
  return this.api.put<Booking>(`/bookings/${id}`, data)
    .then(res => res.data);
}

approveBooking(id: string, status: string) {
  return this.api.patch<Booking>(`/bookings/${id}/approve`, { status })
    .then(res => res.data);
}

updateBookingStatus(id: string, status: string) {
  return this.api
    .patch<Booking>(`/bookings/${id}/`, { status })
    .then(res => res.data);
}


  // ---------------- Visitors ----------------
getVisitors(params?: { flatNumber?: string; date?: string; page?: number; limit?: number }) {
  return this.api.get<ApiResponse<Visitor[]>>('/visitors', { params })
    .then(res => res.data.data); // ✅ Now unwraps consistently
}

createVisitor(data: { name: string; flatNumber: string; vehicle?: string; purpose: string }) {
  return this.api.post<ApiResponse<Visitor>>('/visitors', data)
    .then(res => res.data.data); // ✅ Unwrap
}

checkoutVisitor(id: string) {
  return this.api.patch<ApiResponse<Visitor>>(`/visitors/${id}/checkout`)
    .then(res => res.data.data); // ✅ Unwrap
}


  // ---------------- Technicians ----------------
getTechnicians() {
  return this.api.get<ApiResponse<Technician[]>>('/technicians')
    .then(res => res.data.data); // works correctly
}

createTechnician(data: { name: string; contact: string; specializations: string[]; availability: string }) {
  return this.api.post<ApiResponse<Technician>>('/technicians', data)
    .then(res => res.data.data);
}


updateTechnician(id: string, data: Partial<Technician>) {
  return this.api
    .put<ApiResponse<Technician>>(`/technicians/${id}`, data)
    .then(res => res.data);
}


deleteTechnician(id: string) {
  // Returns message
  return this.api
    .delete<ApiResponse<{ message: string }>>(`/technicians/${id}`)
    .then(res => res.data); // just take the whole object since backend returns { message: ... }
}

}



export const apiService = new ApiService();
