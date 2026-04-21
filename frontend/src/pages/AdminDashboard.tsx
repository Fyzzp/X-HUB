"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, adminApi, userApi, systemApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, RefreshCw, Wifi, X, Check, Copy, CheckCircle2, XCircle, Trash2, Menu, ChevronLeft, Server, Users, Settings, Rocket, Plus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface DashboardStats {
  total_users: number;
  total_nodes: number;
  active_users: number;
  active_nodes: number;
}

interface SystemStats {
  cpu: { cores: number; used_percent: number; model: string };
  memory: { total: number; used: number; available: number; used_percent: number };
  disk: { total: number; used: number; available: number; used_percent: number };
  network: { tcp_conn_count: number; udp_conn_count: number; total_sent: number; total_received: number };
  connections: { established: number; time_wait: number; close_wait: number; listen: number };
  load_avg: { load1: number; load5: number; load15: number };
  uptime: string;
  os: { hostname: string; platform: string; kernel: string };
}

interface DashboardData {
  users: User[];
  stats: DashboardStats;
}

interface User {
  id: number;
  username: string;
  enabled?: boolean;
}

interface NodeInfo {
  alias: string;
  host: string;
}

interface Inbound {
  id: number;
  remark: string;
  port: number;
  protocol: string;
  address: string;
  enable: boolean;
  up: number;
  down: number;
  network?: string;
  streamSettings?: string;
  clientStats?: { id: string; email: string; up: number; down: number; enable: boolean; uuid: string }[];
  settings?: string;
}

interface NodeDetail {
  alias: string;
  host: string;
  inbounds: Inbound[];
  online: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatNodeId(id: string): string {
  return `private|${id}`;
}

function generateLink(inbound: Inbound, host: string, clientUuid: string, remark: string): string {
  try {
    const address = inbound.address || host.replace(/^https?:\/\//, "").split(":")[0];
    const port = inbound.port || 443;
    if (!clientUuid) return "";
    let network = inbound.network || "tcp";
    let security = "";
    if (inbound.streamSettings) {
      try {
        const ss = JSON.parse(inbound.streamSettings);
        network = ss.network || "tcp";
        security = ss.security || "";
      } catch {}
    }
    const obj: any = {
      v: "2",
      ps: remark || "节点",
      add: address,
      port: port,
      id: clientUuid,
      net: network,
      type: "none",
      host: "",
      path: "",
    };
    if (security === "tls") {
      obj.tls = "tls";
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(obj));
    const binary = String.fromCharCode(...data);
    const base64 = btoa(binary);
    return "vmess://" + base64;
  } catch {
    return "";
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ username: string; is_admin: boolean } | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "users" | "settings" | "nodes">("dashboard");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userNodes, setUserNodes] = useState<Record<string, NodeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [nodes, setNodes] = useState<Record<string, { alias: string; host: string; user_id?: number }>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNode, setNewNode] = useState({ alias: "", url: "", base_path: "", user: "", pass: "" });
  const [nodeStatus, setNodeStatus] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [registerEnabled, setRegisterEnabled] = useState(true);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteNodeModal, setShowDeleteNodeModal] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  const [showDeleteInboundModal, setShowDeleteInboundModal] = useState(false);
  const [inboundToDelete, setInboundToDelete] = useState<{id: number; remark: string} | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await adminApi.getDashboard();
      if (res.code === 0 && res.data) {
        setDashboardData(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    setSystemLoading(true);
    try {
      const res = await systemApi.getSystemStats();
      if (res.code === 0 && res.data) {
        setSystemStats(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch system stats:", err);
    } finally {
      setSystemLoading(false);
    }
  };

  const fetchRegisterStatus = async () => {
    try {
      const res = await adminApi.getRegisterStatus();
      if (res.code === 0) {
        setRegisterEnabled(res.data?.enabled ?? true);
      }
    } catch (err) {
      console.error("Failed to fetch register status:", err);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data = await api.me();
        setUser({ username: data.username, is_admin: data.is_admin });
        if (!data.is_admin) {
          navigate("/dashboard");
        }
      } catch {
        navigate("/");
      }
    };
    init();
    fetchDashboard();
    fetchRegisterStatus();
    fetchSystemStats();
    loadNodes();
  }, [navigate]);

  useEffect(() => {
    if (currentView === "nodes") {
      loadNodes();
    }
  }, [currentView]);

  const handleLogout = async () => {
    await api.logout();
    navigate("/");
  };

  const handleToggleRegister = async (enabled: boolean) => {
    setRegisterLoading(true);
    try {
      const res = await adminApi.toggleRegister(enabled);
      if (res.code === 0) {
        setRegisterEnabled(enabled);
      } else {
        alert(res.message || "操作失败");
      }
    } catch (err: any) {
      alert(err?.message || "网络错误，请重试");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleToggleUser = async (userId: number, enabled: boolean) => {
    try {
      const res = await userApi.toggleEnabled(userId, !enabled);
      if (res.code === 0) {
        setDashboardData((prev: any) => ({
          ...prev,
          users: prev.users.map((u: User) => u.id === userId ? { ...u, enabled: !enabled } : u)
        }));
      } else {
        alert(res.message || "操作失败");
      }
    } catch (err: any) {
      alert(err?.message || "网络错误，请重试");
    }
  };

  const handleDeleteUser = (u: User) => {
    setUserToDelete(u);
    setShowDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await adminApi.doAction("delete_user", userToDelete.id);
      if (res.code === 0) {
        setShowDeleteModal(false);
        setUserToDelete(null);
        fetchDashboard();
      } else {
        alert(res.message || "删除失败");
      }
    } catch (err: any) {
      alert(err?.message || "网络错误，请重试");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectUser = async (u: User) => {
    setSelectedUser(u);
    setSelectedNode(null);
    setNodeDetail(null);
    setUserNodes({});
  };

  const loadUserNodes = async (u: User) => {
    setDetailLoading(true);
    try {
      const data = await adminApi.getUserNodes(u.id);
      const userNodesMap: Record<string, NodeInfo> = {};
      const nodeData = data.private || {};
      Object.entries(nodeData).forEach(([id, n]: [string, any]) => {
        userNodesMap[id] = { alias: n.alias, host: n.host };
      });
      setUserNodes(userNodesMap);
      // 自动选中第一个节点
      const nodeIds = Object.keys(userNodesMap);
      if (nodeIds.length > 0) {
        openNodeDetail(nodeIds[0]);
      }
      const statuses: Record<string, boolean> = {};
      for (const nodeId of Object.keys(userNodesMap)) {
        try {
          const status = await api.getNodeStatus(formatNodeId(nodeId));
          statuses[nodeId] = status.online;
        } catch {
          statuses[nodeId] = false;
        }
      }
      setNodeStatus(statuses);
    } catch (err) {
      console.error("Failed to load user nodes:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUser) {
      loadUserNodes(selectedUser);
    }
  }, [selectedUser]);
  const loadNodes = async () => {
    setLoading(true)
    try {
      const data = await api.getNodes()
      setNodes(data.private || {})
      const statuses: Record<string, boolean> = {}
      for (const nodeId of Object.keys(data.private || {})) {
        try {
          const status = await api.getNodeStatus(formatNodeId(nodeId))
          statuses[nodeId] = status.online
        } catch {
          statuses[nodeId] = false
        }
      }
      setNodeStatus(statuses)
    } catch {} finally {
      setLoading(false)
    }
  };

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.saveNode(newNode)
      setShowAddModal(false)
      setNewNode({ alias: "", url: "", base_path: "", user: "", pass: "" })
      loadNodes()
      // Success feedback - could add a toast here
    } catch (err: any) {
      alert(err?.message || "添加失败")
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodeToDelete(nodeId);
    setShowDeleteNodeModal(true);
  };

  const confirmDeleteInbound = async () => {
    if (!inboundToDelete || !selectedNode) return;
    try {
      await api.delete({
        node_id: formatNodeId(selectedNode),
        inbound_id: inboundToDelete.id
      });
      setShowDeleteInboundModal(false);
      setInboundToDelete(null);
      if (selectedNode) openNodeDetail(selectedNode);
    } catch (e: any) {
      alert(e.message || "删除失败");
    }
  };

  const confirmDeleteNode = async () => {
    if (!nodeToDelete) return;
    try {
      const nodeIdNum = parseInt(nodeToDelete);
      await adminApi.doAction("delete_node", nodeIdNum);
      setShowDeleteNodeModal(false);
      setNodeToDelete(null);
      if (selectedNode === nodeToDelete) {
        setSelectedNode(null);
        setNodeDetail(null);
      }
      loadNodes();
    } catch (err: any) {
      alert(err?.message || "删除失败");
    }
  };

  useEffect(() => {
    if (currentView === "nodes") {
      const nodesInterval = setInterval(loadNodes, 30 * 60 * 1000);
      return () => clearInterval(nodesInterval);
    } else if (currentView === "dashboard") {
      const interval = setInterval(fetchSystemStats, 10000);
      return () => clearInterval(interval);
    }
  }, [currentView]);

  const openNodeDetail = async (nodeId: string) => {
    setSelectedNode(nodeId)
    setDetailLoading(true)
    setNodeDetail(null)
    setCopied(null)
    setShowQR(null)
    try {
      const [inboundsRes, statusRes] = await Promise.all([
        api.getNodeInbounds(formatNodeId(nodeId)).catch(() => ({ obj: null, data: null })),
        api.getNodeStatus(formatNodeId(nodeId)).catch(() => ({ online: false }))
      ])
      const node = nodes[nodeId]
      let inbounds: any[] = []
      if (inboundsRes?.obj?.obj) {
        inbounds = inboundsRes.obj.obj
      } else if (inboundsRes?.data?.obj) {
        inbounds = inboundsRes.data.obj
      } else if (Array.isArray(inboundsRes)) {
        inbounds = inboundsRes
      }
      setNodeDetail({
        alias: node?.alias || "",
        host: node?.host || "",
        inbounds: inbounds.map((ib: any) => {
          let network = ib.network || ""
          if (!network && ib.streamSettings) {
            try {
              const ss = JSON.parse(ib.streamSettings)
              network = ss.network || ""
            } catch {}
          }
          return {
            id: ib.id || 0,
            remark: ib.remark || "",
            port: ib.port || 0,
            protocol: ib.protocol || "",
            address: ib.address || "",
            enable: ib.enable !== false,
            up: ib.up || 0,
            down: ib.down || 0,
            network: network,
            stream: ib.stream || "",
            streamSettings: ib.streamSettings || "",
            clientStats: ib.clientStats || [],
            settings: ib.settings || ""
          }
        }),
        online: statusRes.online || false,
      })
    } catch (e) {
      setNodeDetail({
        alias: nodes[nodeId]?.alias || "",
        host: nodes[nodeId]?.host || "",
        inbounds: [],
        online: false,
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleSelectClient = (key: string) => {
    const newSet = new Set(selectedClients)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedClients(newSet)
  }

  const selectAllClientsInInbound = (inboundId: number, clientIds: string[]) => {
    const allSelected = clientIds.every(id => selectedClients.has(`${inboundId}||${id}`))
    const newSet = new Set(selectedClients)
    if (allSelected) {
      clientIds.forEach(id => newSet.delete(`${inboundId}||${id}`))
    } else {
      clientIds.forEach(id => newSet.add(`${inboundId}||${id}`))
    }
    setSelectedClients(newSet)
  }

  const handleBulkCopyClients = () => {
    if (selectedClients.size === 0 || !nodeDetail) return
    const links: string[] = []
    for (const key of selectedClients) {
      const [inboundId, clientUuid] = key.split('||')
      const inbound = nodeDetail.inbounds.find(ib => ib.id === Number(inboundId))
      if (inbound && inbound.clientStats) {
        const client = inbound.clientStats.find((c: any) => c.uuid === clientUuid)
        if (client) {
          const link = generateLink(inbound, nodeDetail.host, clientUuid, client.email)
          if (link) links.push(link)
        }
      }
    }
    if (links.length > 0) {
      handleCopy(links.join("\n"), "bulk-clients")
    } else {
      alert("未找到可复制的链接")
    }
  }

  const handleBulkDeleteClients = () => {
    if (selectedClients.size === 0 || !selectedNode) return
    setBulkDeleteCount(selectedClients.size)
    setShowBulkDeleteModal(true)
  }

  const confirmBulkDeleteClients = async () => {
    setShowBulkDeleteModal(false)
    try {
      const byInbound: Record<number, string[]> = {}
      for (const key of selectedClients) {
        const [inboundId, clientId] = key.split('||')
        const ibId = Number(inboundId)
        if (!byInbound[ibId]) byInbound[ibId] = []
        byInbound[ibId].push(clientId)
      }
      for (const [inboundId, clientIds] of Object.entries(byInbound)) {
        await api.delete({
          node_id: formatNodeId(selectedNode || ""),
          inbound_id: Number(inboundId),
          client_ids: clientIds
        })
      }
      setSelectedClients(new Set())
      selectedNode && openNodeDetail(selectedNode)
    } catch (e: any) {
      alert(e.message || "删除失败")
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 hidden lg:flex`}>
        <div className="h-16 border-b border-slate-200 flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {sidebarOpen && <span className="text-lg font-bold text-slate-800">X-HUB</span>}
        </div>

        <nav className="flex-1 py-4">
          <div className="px-3 space-y-1">
            <button
              onClick={() => { setCurrentView("dashboard"); setSelectedUser(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${currentView === "dashboard" ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Settings className="w-5 h-5" />
              {sidebarOpen && <span>系统概览</span>}
            </button>
            <button
              onClick={() => { setCurrentView("nodes"); setSelectedUser(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${currentView === "nodes" ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Rocket className="w-5 h-5" />
              {sidebarOpen && <span>我的节点</span>}
            </button>
            <button
              onClick={() => { setCurrentView("users"); setSelectedUser(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${currentView === "users" ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Users className="w-5 h-5" />
              {sidebarOpen && <span>用户管理</span>}
            </button>
            <button
              onClick={() => { setCurrentView("settings"); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${currentView === "settings" ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Settings className="w-5 h-5" />
              {sidebarOpen && <span>系统设置</span>}
            </button>
          </div>
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-slate-600">{user?.username?.[0]?.toUpperCase()}</span>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user?.username}</p>
                <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-red-500">退出登录</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 shadow-sm z-50 flex items-center px-4">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -ml-2 text-slate-500 hover:text-slate-700">
          {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-base font-bold text-slate-800">X-HUB</span>
        </div>
        <span className="ml-auto text-sm text-slate-500">{user?.username}</span>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 lg:p-6 pt-20 lg:pt-6 min-h-screen">
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
          {/* Main Content */}
          <div className={`${selectedUser ? "hidden lg:block lg:w-1/2" : "w-full"} flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden`}>
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">
                  {currentView === "dashboard" && "系统概览"}
                  {currentView === "users" && "用户列表"}
                  {currentView === "settings" && "系统设置"}
                  {currentView === "nodes" && "我的节点"}
                </h2>
                <Button variant="ghost" size="sm" onClick={async () => { setLoading(true); setSystemLoading(true); await Promise.all([fetchDashboard().catch(() => {}), fetchSystemStats().catch(() => {})]); setLoading(false); setSystemLoading(false); }} className={`text-slate-400 hover:text-blue-600 h-8 px-3 ${currentView === "nodes" ? "hidden" : ""}`}>
                  <RefreshCw className={`w-4 h-4 ${loading || systemLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {/* Dashboard View */}
              {currentView === "dashboard" && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-800">服务器状态</h3>
                  </div>
                  {systemStats ? (
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                            <Server className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{systemStats.os?.hostname || "Unknown"}</p>
                            <p className="text-sm text-slate-500">{systemStats.os?.platform} / {systemStats.os?.kernel}</p>
                          </div>
                          <div className="ml-auto text-right">
                            <p className="text-sm text-slate-500">运行时长</p>
                            <p className="font-medium text-slate-700">{systemStats.uptime}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-blue-600 font-medium">CPU</span>
                            <span className="text-xs text-blue-500">{systemStats.cpu?.cores} 核心</span>
                          </div>
                          <p className="text-2xl font-bold text-blue-600">{systemStats.cpu?.used_percent?.toFixed(1) || 0}%</p>
                          <p className="text-xs text-slate-500 mt-1 truncate">{systemStats.cpu?.model || "Unknown"}</p>
                          <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${systemStats.cpu?.used_percent || 0}%` }} />
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-green-600 font-medium">内存</span>
                            <span className="text-xs text-green-500">{formatBytes(systemStats.memory?.total || 0)}</span>
                          </div>
                          <p className="text-2xl font-bold text-green-600">{systemStats.memory?.used_percent?.toFixed(1) || 0}%</p>
                          <p className="text-xs text-slate-500 mt-1">{formatBytes(systemStats.memory?.used || 0)} / {formatBytes(systemStats.memory?.total || 0)}</p>
                          <div className="mt-2 h-2 bg-green-200 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${systemStats.memory?.used_percent || 0}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-purple-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-purple-600 font-medium">网络连接</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{systemStats.connections?.established || 0}</p>
                            <p className="text-xs text-slate-500">已建立</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{systemStats.connections?.listen || 0}</p>
                            <p className="text-xs text-slate-500">监听中</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{systemStats.network?.tcp_conn_count || 0}</p>
                            <p className="text-xs text-slate-500">TCP连接</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 rounded-xl p-4">
                          <p className="text-sm text-orange-600 font-medium mb-1">已发送</p>
                          <p className="text-xl font-bold text-orange-600">{formatBytes(systemStats.network?.total_sent || 0)}</p>
                        </div>
                        <div className="bg-cyan-50 rounded-xl p-4">
                          <p className="text-sm text-cyan-600 font-medium mb-1">已接收</p>
                          <p className="text-xl font-bold text-cyan-600">{formatBytes(systemStats.network?.total_received || 0)}</p>
                        </div>
                      </div>

                      <div className="bg-slate-100 rounded-xl p-4">
                        <p className="text-sm text-slate-600 font-medium mb-2">系统负载</p>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-lg font-bold text-slate-700">{systemStats.load_avg?.load1?.toFixed(2) || "0.00"}</p>
                            <p className="text-xs text-slate-400">1分钟</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-slate-700">{systemStats.load_avg?.load5?.toFixed(2) || "0.00"}</p>
                            <p className="text-xs text-slate-400">5分钟</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-slate-700">{systemStats.load_avg?.load15?.toFixed(2) || "0.00"}</p>
                            <p className="text-xs text-slate-400">15分钟</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-xl p-3">
                          <p className="text-xs text-blue-500">总用户数</p>
                          <p className="text-xl font-bold text-blue-600">{dashboardData?.stats?.total_users || 0}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-3">
                          <p className="text-xs text-green-500">活跃用户</p>
                          <p className="text-xl font-bold text-green-600">{dashboardData?.stats?.active_users || 0}</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-3">
                          <p className="text-xs text-purple-500">总节点数</p>
                          <p className="text-xl font-bold text-purple-600">{dashboardData?.stats?.total_nodes || 0}</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3">
                          <p className="text-xs text-orange-500">在线节点</p>
                          <p className="text-xl font-bold text-orange-600">{dashboardData?.stats?.active_nodes || 0}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      {systemLoading ? "加载中..." : "暂无系统数据"}
                    </div>
                  )}
                </>
              )}

              {/* Users View */}
              {currentView === "users" && !selectedUser && (
                <div className="space-y-4">
                  {loading ? (
                    <div className="text-center py-12 text-slate-400">加载中...</div>
                  ) : dashboardData?.users?.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">暂无用户数据</div>
                  ) : (
                    <div className="grid gap-4">
                      {dashboardData?.users?.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                          onClick={() => handleSelectUser(u)}
                        >
                          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-white">{u.username?.[0]?.toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-800">{u.username}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${u.enabled !== false ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                                {u.enabled !== false ? "正常" : "已封禁"}
                              </span>
                            </div>
                            <p className="text-sm text-slate-400">ID: {u.id}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); if (!(actionLoading || u.id === 1)) handleToggleUser(u.id, u.enabled !== false); }}
                              disabled={actionLoading || u.id === 1}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${u.enabled !== false ? "bg-blue-600" : "bg-slate-300"} disabled:opacity-50`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${u.enabled !== false ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleSelectUser(u); }}
                              className="text-blue-600 border-blue-200 hover:bg-blue-50 h-8 px-3 rounded-xl"
                            >
                              <Server className="w-4 h-4 mr-1" /> 查看节点
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDeleteUser(u); }}
                              disabled={actionLoading || u.id === 1}
                              className="text-red-600 border-red-200 hover:bg-red-50 h-8 px-3 rounded-xl"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Settings View */}
              {currentView === "settings" && (
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-medium text-slate-800">用户注册控制</h3>
                        <p className="text-sm text-slate-500 mt-1">开启后，新用户可以自主注册账号</p>
                      </div>
                      <button
                        onClick={() => handleToggleRegister(!registerEnabled)}
                        disabled={registerLoading}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${registerEnabled ? "bg-blue-600" : "bg-slate-300"} disabled:opacity-50`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${registerEnabled ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Nodes View */}
              {currentView === "nodes" && (
                <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
                  {/* Left: Node List */}
                  <div className={`${selectedNode && !showAddModal ? "hidden lg:block lg:w-1/2" : "w-full lg:w-full"} flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden`}>
                    <div className="p-4 lg:p-6 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-800">我的节点</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadNodes}
                            className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 px-3"
                          >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => { setShowAddModal(true); setSelectedNode(null); setNodeDetail(null); }}
                            className="bg-blue-500 hover:bg-blue-600 text-white h-8 px-4 rounded-xl shadow-sm"
                          >
                            <Plus className="w-4 h-4 mr-1" /> 添加
                          </Button>
                        </div>
                      </div>

                      {/* Stats */}
                      {addSuccess && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm text-center">
                          节点添加成功
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500">节点数</p>
                          <p className="text-xl font-bold text-slate-800">{Object.keys(nodes).length}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-3">
                          <p className="text-xs text-green-500">在线</p>
                          <p className="text-xl font-bold text-green-600">{Object.values(nodeStatus).filter(Boolean).length}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500">离线</p>
                          <p className="text-xl font-bold text-slate-400">{Object.keys(nodes).length - Object.values(nodeStatus).filter(Boolean).length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-h-[calc(100vh-16rem)]">
                      {showAddModal ? (
                        <form onSubmit={handleSaveNode} className="space-y-4">
                          <Input
                            placeholder="节点名称"
                            value={newNode.alias}
                            onChange={(e) => setNewNode({ ...newNode, alias: e.target.value })}
                            required
                            className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                          />
                          <Input
                            placeholder="面板地址 https://..."
                            value={newNode.url}
                            onChange={(e) => setNewNode({ ...newNode, url: e.target.value })}
                            required
                            className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                          />
                          <Input
                            placeholder="基础路径 如 /"
                            value={newNode.base_path}
                            onChange={(e) => setNewNode({ ...newNode, base_path: e.target.value })}
                            required
                            className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                          />
                          <Input
                            placeholder="面板用户名"
                            value={newNode.user}
                            onChange={(e) => setNewNode({ ...newNode, user: e.target.value })}
                            required
                            className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                          />
                          <Input
                            type="password"
                            placeholder="面板密码"
                            value={newNode.pass}
                            onChange={(e) => setNewNode({ ...newNode, pass: e.target.value })}
                            required
                            className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                          />
                          <div className="flex gap-3">
                            <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white h-12 rounded-xl">保存</Button>
                            <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); setNewNode({ alias: "", url: "", base_path: "", user: "", pass: "" }); }} className="flex-1 h-12 rounded-xl">取消</Button>
                          </div>
                        </form>
                      ) : loading ? (
                        <div className="text-center py-12 text-slate-400">加载中...</div>
                      ) : Object.keys(nodes).length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Wifi className="w-7 h-7 text-slate-400" />
                          </div>
                          <p className="text-slate-500 mb-4">暂无节点</p>
                          <Button size="sm" onClick={() => setShowAddModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl h-9 px-4">
                            <Plus className="w-4 h-4 mr-1" /> 添加节点
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(nodes).map(([id, info]) => (
                            <div
                              key={id}
                              onClick={() => selectedNode === id ? (setSelectedNode(null), setNodeDetail(null)) : openNodeDetail(id)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedNode === id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nodeStatus[id] ? "bg-green-50" : "bg-slate-100"}`}>
                                    <Wifi className={`w-5 h-5 ${nodeStatus[id] ? "text-green-500" : "text-slate-400"}`} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-slate-800">{info.alias}</p>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${nodeStatus[id] ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                                        {nodeStatus[id] ? "在线" : "离线"}
                                      </span>
                                    </div>
                                    <p className="text-sm text-slate-400">{info.host}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Node Detail */}
                  {selectedNode && !showAddModal && (
                    <div className="lg:w-1/2 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-800">{nodeDetail?.alias || "加载中..."}</h3>
                          {nodeDetail && <p className="text-sm text-slate-400">{nodeDetail.host}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {nodeDetail && (
                            <span className={`text-xs px-2 py-1 rounded-full ${nodeDetail.online ? "bg-green-100 text-green-600" : "bg-red-100 text-red-400"}`}>
                              {nodeDetail.online ? "在线" : "离线"}
                            </span>
                          )}
                          <button onClick={() => handleDeleteNode(selectedNode)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setSelectedNode(null); setNodeDetail(null); }} className="p-2 text-slate-400 hover:text-slate-600 lg:hidden">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-16rem)]">
                        {detailLoading ? (
                          <div className="text-center py-12 text-slate-400">加载中...</div>
                        ) : nodeDetail ? (
                          <div className="space-y-4">
                            {nodeDetail.inbounds.length === 0 ? (
                              <div className="text-center py-8 text-slate-400">
                                <p>暂无入站配置</p>
                                <p className="text-xs mt-1">请在节点面板中添加入站配置</p>
                              </div>
                            ) : (
                              nodeDetail.inbounds.map((inbound) => (
                                <div key={inbound.id} className="border border-slate-200 rounded-xl p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-slate-800">{inbound.remark || "入站 " + inbound.id}</span>
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">{inbound.protocol || "未知"}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${inbound.enable ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                                        {inbound.enable ? "启用" : "禁用"}
                                      </span>
                                    </div>
                                    <button onClick={() => { setInboundToDelete(inbound); setShowDeleteInboundModal(true); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>

                                  {/* Connection Info */}
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div className="bg-slate-50 rounded-lg p-2.5">
                                      <p className="text-xs text-slate-400 mb-0.5">地址</p>
                                      <div className="flex items-center gap-1">
                                        <p className="text-sm font-mono text-slate-700 truncate flex-1">{inbound.address || nodeDetail.host.replace(/^https?:\/\//, "")}</p>
                                        <button onClick={() => handleCopy(inbound.address || nodeDetail.host, `addr-${inbound.id}`)} className="text-slate-400 hover:text-blue-500 flex-shrink-0">
                                          {copied === `addr-${inbound.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-2.5">
                                      <p className="text-xs text-slate-400 mb-0.5">端口</p>
                                      <div className="flex items-center gap-1">
                                        <p className="text-sm font-mono text-slate-700">{inbound.port || "-"}</p>
                                        <button onClick={() => handleCopy(String(inbound.port), `port-${inbound.id}`)} className="text-slate-400 hover:text-blue-500 flex-shrink-0">
                                          {copied === `port-${inbound.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Traffic */}
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div className="bg-green-50 rounded-lg p-2.5">
                                      <p className="text-xs text-green-500 mb-0.5">已上传</p>
                                      <p className="text-sm font-medium text-green-700">{formatBytes(inbound.up)}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-2.5">
                                      <p className="text-xs text-blue-500 mb-0.5">已下载</p>
                                      <p className="text-sm font-medium text-blue-700">{formatBytes(inbound.down)}</p>
                                    </div>
                                  </div>

                                  {/* Client List */}
                                  {inbound.clientStats && inbound.clientStats.length > 0 && (() => {
                                    const clientIds = inbound.clientStats.map((c: any) => c.uuid)
                                    const selectedInThisInbound = clientIds.filter((id: string) => selectedClients.has(`${inbound.id}||${id}`)).length
                                    return (
                                      <div className="space-y-3 mt-3 pt-3 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-medium text-slate-500">用户链接</p>
                                          {inbound.clientStats.length > 1 && (
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={selectedInThisInbound === inbound.clientStats.length}
                                                onChange={() => selectAllClientsInInbound(inbound.id, clientIds)}
                                                className="w-4 h-4 rounded accent-blue-500"
                                              />
                                              <span className="text-xs text-slate-400">全选</span>
                                            </div>
                                          )}
                                        </div>
                                        {selectedInThisInbound > 0 && (
                                          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                                            <span className="text-xs text-blue-600">已选择 {selectedInThisInbound} 个</span>
                                            <button onClick={handleBulkCopyClients} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                              {copied === "bulk-clients" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                              {copied === "bulk-clients" ? "已复制" : "复制"}
                                            </button>
                                            <button onClick={handleBulkDeleteClients} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                                              <Trash2 className="w-3 h-3" /> 删除
                                            </button>
                                          </div>
                                        )}
                                        {inbound.clientStats.map((client: any, idx: number) => {
                                          const clientUuid = client.uuid || ""
                                          const clientKey = `${inbound.id}||${clientUuid}`
                                          const link = clientUuid ? generateLink(inbound, nodeDetail.host, clientUuid, client.email) : ""
                                          const clientQRKey = `qr-${inbound.id}-${clientUuid}`
                                          return (
                                            <div key={clientUuid || idx} className={`bg-slate-50 rounded-xl p-3 ${selectedClients.has(clientKey) ? 'ring-2 ring-blue-400' : ''}`}>
                                              <div className="flex items-center justify-between mb-2 min-w-0">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedClients.has(clientKey)}
                                                    onChange={() => toggleSelectClient(clientKey)}
                                                    className="w-4 h-4 rounded accent-blue-500 flex-shrink-0"
                                                  />
                                                  <p className="text-sm text-slate-700 truncate min-w-0">{client.email}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                  <button
                                                    onClick={() => setShowQR(showQR === clientQRKey ? null : clientQRKey)}
                                                    className="text-slate-400 hover:text-blue-500 p-1"
                                                  >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                                                  </button>
                                                  {link && (
                                                    <button
                                                      onClick={() => handleCopy(link, `link-${clientUuid}`)}
                                                      className="text-slate-400 hover:text-blue-500 p-1"
                                                    >
                                                      {copied === `link-${clientUuid}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-3 gap-1 text-xs mt-2">
                                                <div className="bg-white rounded p-1.5 text-center">
                                                  <p className="text-slate-400">↑ {formatBytes(client.up)}</p>
                                                </div>
                                                <div className="bg-white rounded p-1.5 text-center">
                                                  <p className="text-slate-400">↓ {formatBytes(client.down)}</p>
                                                </div>
                                                <div className="bg-white rounded p-1.5 text-center">
                                                  <p className={`${client.enable ? "text-green-500" : "text-slate-400"}`}>{client.enable ? "启用" : "禁用"}</p>
                                                </div>
                                              </div>
                                              {showQR === clientQRKey && link && (
                                                <div className="mt-2 p-2 bg-white rounded-lg flex justify-center">
                                                  <div className="bg-white p-2 rounded-lg inline-block">
                                                    <QRCodeSVG value={link} size={160} level="M" />
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })()}
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-slate-400">暂无详情</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* User Detail Panel */}
          {currentView === "users" && selectedUser && (
            <div className="lg:w-1/2 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{selectedUser.username}</h3>
                  <p className="text-sm text-slate-400">ID: {selectedUser.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${selectedUser.enabled !== false ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                    {selectedUser.enabled !== false ? "正常" : "已封禁"}
                  </span>
                  <button onClick={() => { setSelectedUser(null); setNodeDetail(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-16rem)]">
                {detailLoading ? (
                  <div className="text-center py-12 text-slate-400">加载中...</div>
                ) : Object.keys(userNodes).length === 0 ? (
                  <div className="text-center py-12 text-slate-500">该用户暂无节点</div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(userNodes).map(([id, info]) => (
                      <div key={id} className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nodeStatus[id] ? "bg-green-50" : "bg-slate-100"}`}>
                            <Wifi className={`w-5 h-5 ${nodeStatus[id] ? "text-green-500" : "text-slate-400"}`} />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{info.alias}</p>
                            <p className="text-sm text-slate-400">{info.host}</p>
                          </div>
                          <span className={`ml-auto text-xs px-2 py-1 rounded-full ${nodeStatus[id] ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                            {nodeStatus[id] ? "在线" : "离线"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openNodeDetail(id)}
                          className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          查看详情
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">确认批量删除</h3>
            <p className="text-slate-500 text-center mb-6">确定要删除选中的 {bulkDeleteCount} 个用户链接吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowBulkDeleteModal(false)} className="flex-1 h-12 rounded-xl">
                取消
              </Button>
              <Button onClick={confirmBulkDeleteClients} className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white">
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Inbound Modal */}
      {showDeleteInboundModal && inboundToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">确认删除入站</h3>
            <p className="text-slate-500 text-center mb-6">确定要删除入站 "{inboundToDelete.remark}" 吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowDeleteInboundModal(false); setInboundToDelete(null); }} className="flex-1 h-12 rounded-xl">
                取消
              </Button>
              <Button onClick={confirmDeleteInbound} className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white">
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Node Modal */}
      {showDeleteNodeModal && nodeToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">确认删除节点</h3>
            <p className="text-slate-500 text-center mb-6">确定要删除该节点吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowDeleteNodeModal(false); setNodeToDelete(null); }} className="flex-1 h-12 rounded-xl">
                取消
              </Button>
              <Button onClick={confirmDeleteNode} className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white">
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">确认删除用户</h3>
            <p className="text-slate-500 text-center mb-6">确定要删除用户 "{userToDelete.username}" 吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="flex-1 h-12 rounded-xl">
                取消
              </Button>
              <Button onClick={confirmDeleteUser} disabled={actionLoading} className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white">
                {actionLoading ? "处理中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
