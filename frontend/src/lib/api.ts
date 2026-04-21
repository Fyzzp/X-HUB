const API_BASE = "/api"

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  const data = await res.json()
  if (res.status === 403) {
    // User disabled, redirect to login
    if (typeof window !== "undefined") {
      localStorage.setItem("showDisabledModal", "1");
      window.location.href = "/";
    }
    throw new Error(data.msg || "您的账户已被禁用，请联系管理员");
  }
  if (!res.ok) throw new Error(data.msg || "Request failed")
  return data
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  enabled?: boolean;
  created_at?: string;
  last_login?: string;
}

export interface Node {
  id: number;
  name: string;
  address: string;
  port: number;
  status?: string;
  remark?: string;
  node_id?: number;
}

export interface DashboardStats {
  total_users: number;
  total_nodes: number;
  active_users: number;
  active_nodes: number;
}

export interface DashboardData {
  users: User[];
  nodes: Node[];
  stats: DashboardStats;
}

export interface AdminDashboardResponse {
  code: number;
  message?: string;
  data?: DashboardData;
}

export const api = {
  register: (username: string, password: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),

  registerWithCode: (username: string, email: string, code: string, password: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, email, code, password }) }),

  login: (username: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  sendVerifyCode: (email: string) =>
    request("/auth/send_code", { method: "POST", body: JSON.stringify({ email }) }),

  sendResetCode: (email: string) =>
    request("/auth/send_reset_code", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (email: string, code: string, password: string) =>
    request("/auth/reset_password", { method: "POST", body: JSON.stringify({ email, code, password }) }),

  getNodes: () => request("/nodes"),
  getInbounds: (nodeId: string) => request(`/inbounds?node_id=${nodeId}`),
  getNodeInbounds: (nodeId: string) => request(`/nodes/inbounds?node_id=${nodeId}`),
  getNodeStatus: (nodeId: string) => request(`/nodes/status?node_id=${nodeId}`),
  getSubscription: (nodeId: string) => request(`/subscription/${nodeId}`),
  saveNode: (node: any) => request("/nodes/save", { method: "POST", body: JSON.stringify(node) }),
  deploy: (data: any) => request("/deploy", { method: "POST", body: JSON.stringify(data) }),
  deploySocks5: (data: {
    node_id: string
    inbound_id: number
    socks5_list: string
    tag_prefix: string
    start_number: number
    order: string
  }) => request("/deploy/socks5", { method: "POST", body: JSON.stringify(data) }),
  delete: (data: any) => request("/delete", { method: "POST", body: JSON.stringify(data) }),
  restart: (nodeId: string) => request("/restart", { method: "POST", body: JSON.stringify({ node_id: nodeId }) }),
}

export const adminApi = {
  getDashboard: (): Promise<{code: number; data?: DashboardData}> => {
    return request("/admin/dashboard");
  },

  doAction: (action: 'delete_user' | 'delete_node', id: number) => {
    return request("/admin/action", { method: "POST", body: JSON.stringify({ action, id }) });
  },

  toggleRegister: (enabled: boolean) => {
    return request("/admin/toggle_register", { method: "POST", body: JSON.stringify({ Enabled: enabled }) });
  },

  getRegisterStatus: () => {
    return request("/register/status");
  },

  getUserNodes: (userId: number) => {
    return request(`/admin/user/${userId}/nodes`);
  },
}

export const systemApi = {
  getSystemStats: () => {
    return request("/admin/system_stats");
  },
};

export const userApi = {
  toggleEnabled: (userID: number, enabled: boolean) => {
    return request("/admin/toggle_user", { method: "POST", body: JSON.stringify({ user_id: userID, enabled }) });
  },
};
