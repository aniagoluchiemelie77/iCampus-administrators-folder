export type AdminUser = {
  uid: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  adminType: string;
  profilePic?: string[] | string;
  isVerified?: boolean;
  lastAccessed?: string;
  [key: string]: unknown;
};

export type AdminSession = {
  accessToken: string;
  refreshToken?: string;
  admin: AdminUser;
};

export type Attachment = { url: string; type?: 'image' | 'file' | string; fileName?: string };

export type SupportTicket = {
  ticketRefId: string;
  status?: string;
  source?: string;
  guestEmail?: string;
  userId?: string;
  summary?: string;
  category?: string;
  severity?: string;
  originalMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  thread?: Array<{
    message?: string;
    sender?: string;
    timestamp?: string;
    attachments?: Attachment[];
  }>;
  [key: string]: unknown;
};

const SESSION_KEY = 'icampus-admin-session';

export const backendUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (!configuredUrl) {
    throw new Error('Set EXPO_PUBLIC_BACKEND_URL in your .env file.');
  }
  return configuredUrl.endsWith('/') ? configuredUrl : `${configuredUrl}/`;
};

export const readSession = (): AdminSession | null => {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AdminSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export const writeSession = (session: AdminSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const SESSION_EXPIRED_EVENT = 'icampus-admin-session-expired';

export const clearSession = () => {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_KEY);
};

const expireSession = () => {
  clearSession();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
};

const json = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error('The server returned an invalid response.');
  }
};

const refreshAccessToken = async (session: AdminSession) => {
  if (!session.refreshToken) return null;
  const response = await fetch(`${backendUrl()}users/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const result = await json(response);
  if (!response.ok || !result.accessToken) return null;

  const refreshed = {
    ...session,
    accessToken: result.accessToken as string,
    refreshToken: (result.refreshToken as string | undefined) ?? session.refreshToken,
  };
  writeSession(refreshed);
  return refreshed;
};

const request = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const session = readSession();
  const send = (accessToken?: string) =>
    fetch(`${backendUrl()}${path.replace(/^\/+/, '')}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let response = await send(session?.accessToken);
  if (response.status === 401 && session) {
    const refreshed = await refreshAccessToken(session);
    if (!refreshed) {
      expireSession();
      throw new Error('Your session expired. Please sign in again.');
    }
    response = await send(refreshed.accessToken);
  }

  const result = await json(response);
  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || result.error || `Request failed (${response.status}).`,
    );
  }
  return result as T;
};

const idempotencyKey = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const loginAdmin = async (identifier: string, password: string) => {
  const deviceId =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('icampus-admin-device-id') ??
        idempotencyKey()
      : idempotencyKey();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('icampus-admin-device-id', deviceId);
  }

  const response = await fetch(`${backendUrl()}users/admin-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey(),
    },
    body: JSON.stringify({
      credentials: {
        identifier: identifier.trim().toLowerCase(),
        password,
        socialProvider: 'password',
        deviceId,
        deviceName:
          typeof navigator === 'undefined' ? 'Web browser' : navigator.userAgent,
      },
    }),
  });
  const result = await json(response);
  if (!response.ok || !result.accessToken || !result.admin) {
    throw new Error(
      result.message || result.error || 'Unable to sign in with those credentials.',
    );
  }
  return {
    accessToken: result.accessToken as string,
    refreshToken: result.refreshToken as string | undefined,
    admin: result.admin as AdminUser,
  };
};

export const getAdminMetrics = () => request<Record<string, any>>('admins/get-overview');

export const getAdmins = async () => {
  const result = await request<any>('admins/fetch-all');
  const admins = Array.isArray(result) ? result : result.data;
  return Array.isArray(admins) ? (admins as AdminUser[]) : [];
};

export const fetchTickets = async (limit = 20, cursor = '') => {
  const params = new URLSearchParams({ limit: String(limit), cursor });
  const result = await request<any>(`support/tickets/fetch-all?${params}`);
  return {
    tickets: (result.tickets ?? result.data ?? []) as SupportTicket[],
    nextCursor: (result.nextCursor as string | null) ?? null,
  };
};

export const fetchTicket = async (ticketRefId: string) => {
  const result = await request<any>(
    `admins/support-tickets/${encodeURIComponent(ticketRefId)}/fetch`,
  );
  return (result.ticket ?? result.data ?? result) as SupportTicket;
};

export const replyToTicket = (
  ticketRefId: string,
  message: string,
  attachments: Attachment[] = [],
) =>
  request<any>(
    `admins/support-tickets/${encodeURIComponent(ticketRefId)}/reply`,
    {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ message, attachments }),
    },
  );

// The iCampus app sent this one as `Idempotency-Key` (not the X- variant).
export const updateTicketStatus = (ticketRefId: string, status: string) =>
  request<any>(
    `support/tickets/${encodeURIComponent(ticketRefId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ status }),
    },
  );

export const sendSystemNotification = (notification: {
  ticketRefId: string;
  recipientId?: string;
  title: string;
  message: string;
  category: string;
}) =>
  request<any>('admins/support/send-notification', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(notification),
  });

export const fetchUserDetails = async (uid: string) => {
  const result = await request<any>(`admins/fetch-user/${encodeURIComponent(uid)}`);
  return (result.user ?? result) as Record<string, any>;
};

export const fetchUserNotifications = async (uid: string, limit = 10) => {
  const result = await request<any>(
    `admins/fetch-notifications/${encodeURIComponent(uid)}?limit=${limit}`,
  );
  const list = Array.isArray(result) ? result : result.notifications ?? result.data;
  return Array.isArray(list) ? list : [];
};

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const getNotifications = (category: string, page = 1) =>
  request<any>(
    `admins/get-notifications?${new URLSearchParams({
      category,
      page: String(page),
      limit: String(NOTIFICATIONS_PAGE_SIZE),
    })}`,
  ).then(result => {
    const list = Array.isArray(result) ? result : result.data;
    return Array.isArray(list) ? list : [];
  });

export const searchUsers = async (query: string, viewerTier: string) => {
  const params = new URLSearchParams({ q: query, viewerTier, viewerRole: 'admin' });
  const result = await request<any>(`users/search?${params}`);
  return (result.data ?? []) as Array<Record<string, any>>;
};

export const searchPosts = async (query: string) => {
  const params = new URLSearchParams({ q: query });
  const result = await request<any>(`posts/search?${params}`);
  return (result.posts ?? []) as Array<Record<string, any>>;
};

export const searchCourses = async (query: string) => {
  const params = new URLSearchParams({ q: query });
  const result = await request<any>(`users/courses/search?${params}`);
  return (result.courses ?? []) as Array<Record<string, any>>;
};

export const searchAcademicResources = async (query: string) => {
  const params = new URLSearchParams({ q: query });
  const result = await request<any>(`users/courses/resources/search?${params}`);
  return (result.resources ?? []) as Array<Record<string, any>>;
};

// The iCampus app searched its locally synced catalogue; the web portal has no
// local database, so it loads the same catalogue once and filters in memory.
let productCatalog: Promise<Array<Record<string, any>>> | null = null;
export const searchStore = async (query: string) => {
  productCatalog ??= request<any>('store/fetch-all-products')
    .then(result => (Array.isArray(result.products) ? result.products : []))
    .catch(error => {
      productCatalog = null;
      throw error;
    });
  const term = query.toLowerCase().trim();
  return (await productCatalog)
    .filter(product =>
      [product.title, product.description, product.niche].some(
        value => typeof value === 'string' && value.toLowerCase().includes(term),
      ),
    )
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
};

export const updateUser = (
  uid: string,
  user: Record<string, unknown>,
) =>
  request<any>(`admins/edit-users/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(user),
  });

const listFrom = (result: any) => {
  const candidates = [
    result,
    result?.data,
    result?.items,
    result?.data?.items,
    result?.institutions,
    result?.stations,
    result?.ads,
  ];
  return (
    (candidates.find(Array.isArray) as
      | Array<Record<string, any>>
      | undefined) ?? []
  );
};

export const LIST_PAGE_SIZE = 20;

export const getInstitutions = async (page = 1) =>
  listFrom(await request<any>(`admins/get-institutions?page=${page}&limit=${LIST_PAGE_SIZE}`));

export const getStations = async (page = 1) =>
  listFrom(await request<any>(`admins/get-drop-off-stations?page=${page}&limit=${LIST_PAGE_SIZE}`));

export const getSchoolDetails = (id: string) =>
  request<Record<string, any>>(`admins/institutions/${encodeURIComponent(id)}/get-details`);

export const getStationDetails = (id: string) =>
  request<Record<string, any>>(`admins/stations/${encodeURIComponent(id)}/details`);

export const getAds = async () =>
  listFrom(await request<any>('users/ads/fetch-active'));

export const getTaxEntries = async (page = 1, limit = 10) => {
  const result = await request<any>(`admins/tax-entries/fetch?page=${page}&limit=${limit}`);
  return {
    items: listFrom(result),
    totalPages: Number(result.totalPages) || 1,
  };
};

export const requestTaxReport = (month: string, year: string) =>
  request<any>(
    `admins/tax-entries/download?${new URLSearchParams({ month, year })}`,
  );

export const saveInstitution = (
  item: Record<string, any>,
  id?: string,
) =>
  request<any>(
    id
      ? `admins/institutions/${encodeURIComponent(id)}/update`
      : 'admins/institutions/create',
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      body: JSON.stringify(item),
    },
  );

export const deleteInstitution = (id: string) =>
  request<any>(`admins/institutions/${encodeURIComponent(id)}/delete`, {
    method: 'DELETE',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
  });

export const saveStation = (item: Record<string, any>, id?: string) =>
  request<any>(
    id
      ? `admins/stations/${encodeURIComponent(id)}/update`
      : 'admins/stations/create',
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      body: JSON.stringify(item),
    },
  );

export const deleteStation = (id: string) =>
  request<any>(`admins/stations/${encodeURIComponent(id)}/delete`, {
    method: 'DELETE',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
  });

export const saveAd = (item: Record<string, any>, id?: string | number) =>
  request<any>(
    id === undefined ? 'admins/ads/create' : `admins/ads/${id}/update`,
    {
      method: id === undefined ? 'POST' : 'PATCH',
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      body: JSON.stringify(item),
    },
  );

export const deleteAd = (id: string | number) =>
  request<any>(`admins/ads/${id}/delete`, {
    method: 'DELETE',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
  });

export const createAdmin = (admin: {
  firstname: string;
  lastname: string;
  email: string;
  adminType: string;
}) =>
  request<any>('admins/create', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(admin),
  });

export const updateAdmin = (
  uid: string,
  admin: { firstname: string; lastname: string; adminType: string },
) =>
  request<any>(`admins/${encodeURIComponent(uid)}/update`, {
    method: 'PUT',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(admin),
  });

export const deleteAdmin = (uid: string) =>
  request<any>(`admins/${encodeURIComponent(uid)}/delete`, {
    method: 'DELETE',
    headers: { 'X-Idempotency-Key': idempotencyKey() },
  });

/** Unsigned Cloudinary upload, as the iCampus app does for chat attachments. */
export const uploadAttachment = async (file: File) => {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim();
  if (!cloudName || !uploadPreset) {
    throw new Error('Set the EXPO_PUBLIC_CLOUDINARY_* values in your .env file to send attachments.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);
  form.append('folder', 'chat-attachments');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    { method: 'POST', body: form },
  );
  const result = await json(response);
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'The attachment could not be uploaded.');
  }
  return result.secure_url as string;
};
