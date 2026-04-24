import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CustomSelect } from "@/components/CustomSelect"
import { QRCodeSVG } from "qrcode.react"
import { LogOut, Plus, RefreshCw, Wifi, X, Check, Copy, CheckCircle2, XCircle, QrCode, Trash2, Menu, ChevronLeft, Settings, Rocket } from "lucide-react"

interface Inbound {
  id: number
  remark: string
  port: number
  protocol: string
  address: string
  enable: boolean
  up: number
  down: number
  stream?: string
  network?: string
  streamSettings?: string
  clientStats?: { id: string; email: string; up: number; down: number; enable: boolean; uuid: string }[]
  settings?: string
}

interface NodeDetail {
  alias: string
  host: string
  inbounds: Inbound[]
  online: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function formatNodeId(id: string): string {
  return `private|${id}`
}

function generateLink(inbound: Inbound, host: string, clientUuid: string, remark: string): string {
  try {
    const address = inbound.address || host.replace(/^https?:\/\//, "").split(":")[0]
    const port = inbound.port || 443
    if (!clientUuid) return ""
    let network = inbound.network || "tcp"
    let security = ""
    if (inbound.streamSettings) {
      try {
        const ss = JSON.parse(inbound.streamSettings)
        network = ss.network || "tcp"
        security = ss.security || ""
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
    }
    if (security === "tls") {
      obj.tls = "tls"
    }
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(obj))
    const binary = String.fromCharCode(...data)
    const base64 = btoa(binary)
    return "vmess://" + base64
  } catch {
    return ""
  }
}

export default function UserDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ username: string; is_admin: boolean } | null>(null)
  const [nodes, setNodes] = useState<Record<string, { alias: string; host: string }>>({})
  // Tab状态持久化 - 刷新页面记住当前Tab
  const getSavedTab = () => {
    const saved = localStorage.getItem('userTab')
    if (saved === 'add') return { showAdd: true, showDeploy: false }
    if (saved === 'deploy') return { showAdd: false, showDeploy: true }
    return { showAdd: false, showDeploy: false }
  }
  const [showAdd, setShowAdd] = useState(() => getSavedTab().showAdd)
  const [showDeploy, setShowDeploy] = useState(() => getSavedTab().showDeploy)

  // 监听Tab变化自动保存到localStorage
  useEffect(() => {
    if (showAdd) localStorage.setItem('userTab', 'add')
    else if (showDeploy) localStorage.setItem('userTab', 'deploy')
    else localStorage.setItem('userTab', 'nodes')
  }, [showAdd, showDeploy])
  const [deployNode, setDeployNode] = useState("")
  const [deployInbound, setDeployInbound] = useState("")
  const [deployInbounds, setDeployInbounds] = useState<{id: number; remark: string; protocol: string}[]>([])
  const [deployLoading, setDeployLoading] = useState(false)
  const [socks5List, setSocks5List] = useState("")
  const [deployOrder, setDeployOrder] = useState<"asc" | "desc">("asc")
  const [deployTagPrefix, setDeployTagPrefix] = useState("")
  const [deployStartNumber, setDeployStartNumber] = useState("1")
  const [newNode, setNewNode] = useState({ alias: "", url: "", base_path: "", user: "", pass: "" })
  const [clipToast, setClipToast] = useState<{show: boolean, type: 'success' | 'error', message: string}>({show: false, type: 'success', message: ''})
  const [deployToast, setDeployToast] = useState<{show: boolean, type: 'success' | 'error', message: string}>({show: false, type: 'success', message: ''})
  const [savingNode, setSavingNode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "add" | "deploy">("nodes")

  // Node detail - now inline instead of modal
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [nodeStatus, setNodeStatus] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [showQR, setShowQR] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Client selection
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0)

  // Delete inbound
  const [showDeleteInboundModal, setShowDeleteInboundModal] = useState(false)
  const [inboundToDelete, setInboundToDelete] = useState<{id: number; remark: string} | null>(null)

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
      copyToClipboard(links.join("\n"), "bulk-clients")
    } else {
      alert("未找到可复制的链接")
    }
  }

  const handleBulkDeleteClients = () => {
    console.log("DEBUG handleBulkDeleteClients: selectedClients.size=", selectedClients.size)
    console.log("DEBUG handleBulkDeleteClients: selectedClients entries:", Array.from(selectedClients))
    if (selectedClients.size === 0 || !selectedNode) return
    setBulkDeleteCount(selectedClients.size)
    setShowBulkDeleteModal(true)
  }

  const confirmBulkDeleteClients = async () => {
    setShowBulkDeleteModal(false)
    console.log("DEBUG confirmBulkDeleteClients: selectedClients.size=", selectedClients.size)
    console.log("DEBUG confirmBulkDeleteClients: selectedClients entries:", Array.from(selectedClients))
    try {
      const byInbound: Record<number, string[]> = {}
      for (const key of selectedClients) {
        const [inboundId, clientId] = key.split('||')
        const ibId = Number(inboundId)
        console.log("DEBUG: key=", key, "split to inboundId=", inboundId, "clientId=", clientId)
        if (!byInbound[ibId]) byInbound[ibId] = []
        byInbound[ibId].push(clientId)
      }
      console.log("DEBUG confirmBulkDeleteClients: byInbound=", byInbound)
      for (const [inboundId, clientIds] of Object.entries(byInbound)) {
        await api.delete({
          node_id: formatNodeId(selectedNode!),
          inbound_id: Number(inboundId),
          client_ids: clientIds
        })
      }
      setSelectedClients(new Set())
      if (selectedNode) openNodeDetail(selectedNode)
    } catch (e: any) {
      alert(e.message || "删除失败")
    }
  }

  const handleDeleteInbound = (inbound: {id: number; remark: string}) => {
    setInboundToDelete(inbound)
    setShowDeleteInboundModal(true)
  }

  const confirmDeleteInbound = async () => {
    if (!inboundToDelete || !selectedNode) return
    setShowDeleteInboundModal(false)
    try {
      await api.delete({
        node_id: formatNodeId(selectedNode),
        inbound_id: inboundToDelete.id
      })
      setInboundToDelete(null)
      openNodeDetail(selectedNode)
    } catch (e: any) {
      alert(e.message || "删除失败")
    }
  }

  useEffect(() => {
    api.me().then((data) => {
      if (data.code !== 0) navigate("/")
      setUser({ username: data.username, is_admin: data.is_admin })
    }).catch(() => navigate("/"))
    loadNodes()
  }, [])

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
  }

  const loadDeployInbounds = async (nodeId: string) => {
    setDeployLoading(true)
    setDeployInbounds([])
    setDeployInbound("")
    try {
      const data = await api.getNodeInbounds(formatNodeId(nodeId))
      let inbounds: any[] = []
      if (data?.obj?.obj) {
        inbounds = data.obj.obj
      } else if (data?.data?.obj) {
        inbounds = data.data.obj
      } else if (Array.isArray(data)) {
        inbounds = data
      }
      setDeployInbounds(inbounds.map((ib: any) => ({
        id: ib.id,
        remark: ib.remark || `入站 ${ib.id}`,
        protocol: ib.protocol || ""
      })))
    } catch {
      setDeployInbounds([])
    } finally {
      setDeployLoading(false)
    }
  }

  const handleDeployNodeChange = (nodeId: string) => {
    setDeployNode(nodeId)
    if (nodeId) {
      loadDeployInbounds(nodeId)
    }
  }

  const handleDeploySocks5 = async () => {
    if (!deployNode || !socks5List.trim()) {
      alert("请填写完整信息")
      return
    }
    // 如果选择了"创建新入站"或者没有入站，传入0表示需要创建新入站
    const inboundId = deployInbounds.length === 0 || deployInbound === "_auto_create_" ? 0 : parseInt(deployInbound)
    try {
      const result = await api.deploySocks5({
        node_id: `private|${deployNode}`,
        inbound_id: inboundId,
        socks5_list: socks5List,
        tag_prefix: deployTagPrefix,
        start_number: parseInt(deployStartNumber) || 1,
        order: deployOrder
      })
      if (result.success) {
        setDeployToast({
          show: true,
          type: 'success',
          message: '🚀 ' + (result.msg || '部署成功！') + '\n\n已成功部署 ' + socks5List.split('\n').filter(l => l.trim()).length + ' 个 SOCKS5 账号'
        })
        setSocks5List("")
        setDeployTagPrefix("")
        setDeployStartNumber("1")
        // 刷新入站列表
        if (deployNode) {
          loadDeployInbounds(deployNode)
        }
      } else {
        setDeployToast({
          show: true,
          type: 'error',
          message: '❌ 部署失败：' + (result.msg || '未知错误')
        })
      }
    } catch (e: any) {
      alert(e.message || "部署失败")
    }
  }

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingNode(true)
    try {
      // 1. Check for duplicate IP
      const dupRes = await api.checkNodeDuplicate(newNode.url)
      if (dupRes.duplicate) {
        setClipToast({
          show: true,
          type: 'error',
          message: '⚠️ 该节点已添加\n\n检测到您已添加过相同IP的节点，请勿重复添加'
        })
        setSavingNode(false)
        return
      }

      // 2. Test connection before saving
      const connRes = await api.testNodeConnection({
        url: newNode.url,
        base_path: newNode.base_path,
        user: newNode.user,
        pass: newNode.pass
      })
      if (!connRes.success) {
        setClipToast({
          show: true,
          type: 'error',
          message: '❌ ' + (connRes.msg || '连接失败')
        })
        setSavingNode(false)
        return
      }

      // 3. Save node
      await api.saveNode(newNode)
      setClipToast({
        show: true,
        type: 'success',
        message: '✅ 节点添加成功！\n\n已成功连接到面板并保存节点'
      })
      setTimeout(() => {
        setShowAdd(false)
        setNewNode({ alias: "", url: "", base_path: "", user: "", pass: "" })
        loadNodes()
      }, 1500)
    } catch (err: any) {
      setClipToast({
        show: true,
        type: 'error',
        message: '❌ 保存失败：' + (err?.message || '未知错误')
      })
    }
    setSavingNode(false)
  }

  const handleDeleteNode = async (nodeId: string) => {
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!selectedNode) return
    try {
      await api.delete({ node_id: formatNodeId(selectedNode), inbound_id: 0 })
      setShowDeleteModal(false)
      loadNodes()
      setSelectedNode(null)
      setNodeDetail(null)
    } catch (e: any) {
      alert(e.message || "删除失败")
    }
  }

  const handleLogout = async () => {
    await api.logout()
    navigate("/")
  }

  const openNodeDetail = async (nodeId: string) => {
    setSelectedNode(nodeId)
    setDetailLoading(true)
    setNodeDetail(null)
    setCopied(null)
    setShowQR(null)
    setSelectedClients(new Set())
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

  const copyToClipboard = (text: string, type: string) => {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand("copy") } catch {}
    document.body.removeChild(textarea)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const nodeCount = Object.keys(nodes).length
  const onlineCount = Object.values(nodeStatus).filter(Boolean).length

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 hidden lg:flex`}>
        {/* Logo */}
        <div className="h-16 border-b border-slate-200 flex items-center px-4 gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {sidebarOpen && <span className="text-lg font-bold text-slate-800">X-HUB</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4">
          <div className="px-3 space-y-1">
            <button
              onClick={() => { setSidebarTab("nodes"); setShowAdd(false); setShowDeploy(false); if (selectedNode) openNodeDetail(selectedNode) }}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${sidebarTab === "nodes" ? "bg-blue-50 text-blue-600 shadow-sm" : "text-slate-600 hover:bg-slate-100"} relative`}
            >
              <Wifi className="w-5 h-5" />
              {sidebarOpen && <span>我的节点 {nodeCount > 0 && <span className="ml-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full inline-flex items-center justify-center font-bold">{nodeCount}</span>}</span>}
              {!sidebarOpen && <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">我的节点{nodeCount > 0 ? `(${nodeCount})` : ""}</span>}
            </button>
            <button
              onClick={() => { setSidebarTab("add"); setShowAdd(true); setShowDeploy(false); setSelectedNode(null); setNodeDetail(null) }}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${sidebarTab === "add" ? "bg-blue-50 text-blue-600 shadow-sm" : "text-slate-600 hover:bg-slate-100"} relative`}
            >
              <Plus className="w-5 h-5" />
              {sidebarOpen && <span>添加节点</span>}
              {!sidebarOpen && <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">添加节点</span>}
            </button>
            <button
              onClick={() => { setSidebarTab("deploy"); setShowDeploy(true); setShowAdd(false); setSelectedNode(null); setNodeDetail(null) }}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${sidebarTab === "deploy" ? "bg-blue-50 text-blue-600 shadow-sm" : "text-slate-600 hover:bg-slate-100"} relative`}
            >
              <Rocket className="w-5 h-5" />
              {sidebarOpen && <span>一键部署</span>}
              {!sidebarOpen && <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">一键部署</span>}
            </button>
          </div>
        </nav>

        {/* User */}
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

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 z-50 flex items-center shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <button
          onClick={() => { setSidebarTab("nodes"); setShowAdd(false); setShowDeploy(false); if (selectedNode) openNodeDetail(selectedNode) }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${sidebarTab === "nodes" ? "text-blue-600" : "text-slate-400"}`}
        >
          <div className="relative">
            <Wifi className="w-6 h-6" />
            {nodeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{nodeCount}</span>
            )}
          </div>
          <span className="text-[11px] font-medium">我的节点</span>
        </button>
        <button
          onClick={() => { setSidebarTab("add"); setShowAdd(true); setShowDeploy(false); setSelectedNode(null); setNodeDetail(null) }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${sidebarTab === "add" ? "text-blue-600" : "text-slate-400"}`}
        >
          <Plus className="w-6 h-6" />
          <span className="text-[11px] font-medium">添加节点</span>
        </button>
        <button
          onClick={() => { setSidebarTab("deploy"); setShowDeploy(true); setShowAdd(false); setSelectedNode(null); setNodeDetail(null) }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${sidebarTab === "deploy" ? "text-blue-600" : "text-slate-400"}`}
        >
          <Rocket className="w-6 h-6" />
          <span className="text-[11px] font-medium">一键部署</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-red-400"
        >
          <LogOut className="w-6 h-6" />
          <span className="text-[11px] font-medium">退出</span>
        </button>
      </nav>

{/* Main Content */}
      <main className="flex-1 lg:p-6 pt-20 pb-20 lg:pt-6 lg:pb-6 min-h-screen transition-all duration-300">
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
          {/* Left: Node List */}
          <div className={`${selectedNode && !showAdd ? "hidden lg:block lg:w-1/2" : "w-full lg:w-full"} flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden`}>
            <div className="p-4 lg:p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">
                    {showDeploy ? "一键部署" : showAdd ? "添加节点" : "我的节点"}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {!showAdd && !showDeploy && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadNodes}
                      className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 px-3"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                  {!showAdd && !showDeploy && (
                    <Button
                      size="sm"
                      onClick={() => { setShowAdd(true); setSelectedNode(null); setNodeDetail(null) }}
                      className="bg-blue-500 hover:bg-blue-600 text-white h-8 px-4 rounded-xl shadow-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" /> 添加
                    </Button>
                  )}
                </div>
              </div>

              {/* Stats */}
              {!showAdd && !showDeploy && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">节点数</p>
                    <p className="text-xl font-bold text-slate-800">{nodeCount}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-green-500">在线</p>
                    <p className="text-xl font-bold text-green-600">{onlineCount}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">离线</p>
                    <p className="text-xl font-bold text-slate-400">{nodeCount - onlineCount}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              {showDeploy ? (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-medium text-blue-800 mb-2">一键部署 SOCKS5</h3>
                    <p className="text-sm text-blue-600">上传 SOCKS5 配置文件，自动部署到选中的 3X-UI 节点</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">选择节点</label>
                      <CustomSelect
                        value={deployNode}
                        onChange={handleDeployNodeChange}
                        placeholder="请选择节点"
                        options={Object.entries(nodes).map(([id, info]) => ({
                          value: id,
                          label: info.alias
                        }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">选择入站</label>
                      <CustomSelect
                        value={deployInbound}
                        onChange={setDeployInbound}
                        placeholder={deployLoading ? "加载中..." : "选择入站"}
                        disabled={!deployNode || deployLoading}
                        options={[
                          { value: "_auto_create_", label: "+ 创建新入站" },
                          ...deployInbounds.map(ib => ({
                            value: String(ib.id),
                            label: `${ib.remark} (${ib.protocol})`
                          }))
                        ]}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">生成顺序</label>
                      <div className="flex gap-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="deployOrder"
                            value="asc"
                            checked={deployOrder === "asc"}
                            onChange={() => setDeployOrder("asc")}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <span className="text-sm text-slate-700">正序（从上往下依次生成）</span>
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="deployOrder"
                            value="desc"
                            checked={deployOrder === "desc"}
                            onChange={() => setDeployOrder("desc")}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <span className="text-sm text-slate-700">倒序（从下往上依次生成）</span>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Tag 前缀</label>
                        <Input
                          placeholder="如：T-YR短视频-US 26-0508「RCN」"
                          value={deployTagPrefix}
                          onChange={(e) => setDeployTagPrefix(e.target.value)}
                          className="h-10"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">起始编号</label>
                        <Input
                          type="number"
                          placeholder="1"
                          value={deployStartNumber}
                          onChange={(e) => setDeployStartNumber(e.target.value)}
                          className="h-10"
                          min="1"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2 mb-2">
                        <span className="text-sm text-blue-600">📋 粘贴板格式: IP:PORT:用户:密码 或 用户:密码:IP:PORT</span>
                      </div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">SOCKS5 列表</label>
                      <textarea
                        className="w-full h-48 px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-800 font-mono text-sm"
                        placeholder={`支持格式：\nIP:PORT:USER:PASSWORD\nUSER:PASSWORD:IP:PORT\nIP:PORT@USER:PASSWORD\nUSER:PASSWORD@IP:PORT\n\n每行一条`}
                        value={socks5List}
                        onChange={(e) => setSocks5List(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText()
                            const lines = text.split('\n').filter(l => l.trim())
                            if (lines.length > 0) {
                              setSocks5List(text)
                              setDeployToast({
                                show: true,
                                type: 'success',
                                message: '✅ 已扫描 ' + lines.length + ' 个账号\n\n已自动填充到列表，请检查格式是否正确'
                              })
                            } else {
                              setDeployToast({
                                show: true,
                                type: 'error',
                                message: '❌ 剪贴板为空或格式不正确'
                              })
                            }
                          } catch {
                            setDeployToast({
                              show: true,
                              type: 'error',
                              message: '❌ 无法读取剪贴板，请手动粘贴'
                            })
                          }
                        }}
                        className="w-full mt-2 h-10 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        📋 扫描剪贴板自动填充
                      </Button>
                    </div>
                    {/* Deploy toast */}
                  {deployToast.show && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4">
                      <div className={`bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl ${deployToast.type === 'success' ? 'border-4 border-green-400' : 'border-4 border-red-400'}`}>
                        <div className="text-center">
                          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${deployToast.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                            <span className="text-4xl font-bold ${deployToast.type === 'success' ? 'text-green-500' : 'text-red-500'}">{deployToast.type === 'success' ? '✓' : '✕'}</span>
                          </div>
                          <h3 className={`text-xl font-bold mb-3 ${deployToast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {deployToast.type === 'success' ? '部署成功！' : '部署失败'}
                          </h3>
                          <p className="text-slate-700 text-base leading-relaxed whitespace-pre-line mb-6 font-medium">{deployToast.message}</p>
                          <Button
                            onClick={() => setDeployToast({...deployToast, show: false})}
                            className={`w-full h-14 rounded-2xl text-lg font-bold ${deployToast.type === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-500 hover:bg-slate-600 text-white'}`}
                          >
                            确 定
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                    <Button
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white h-12 rounded-xl"
                      onClick={handleDeploySocks5}
                      disabled={!deployNode || !deployInbound || !socks5List.trim()}
                    >
                      <Rocket className="w-4 h-4 mr-2" /> 开始部署
                    </Button>
                  </div>
                </div>
              ) : showAdd ? (
                <form onSubmit={handleSaveNode} className="space-y-4">
                  {/* Clipboard scan hint */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
                    <span className="text-sm text-blue-600">📋 剪贴板格式: URL/基础路径/用户名/密码</span>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">节点名称 <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="给自己起的节点名字"
                      value={newNode.alias}
                      onChange={(e) => setNewNode({ ...newNode, alias: e.target.value })}
                      required
                      className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">面板地址 <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="https://..."
                      value={newNode.url}
                      onChange={(e) => setNewNode({ ...newNode, url: e.target.value })}
                      required
                      className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">基础路径 <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="如 /PS2pN1BtGSSvqpNj08"
                      value={newNode.base_path}
                      onChange={(e) => setNewNode({ ...newNode, base_path: e.target.value })}
                      required
                      className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">用户名 <span className="text-red-500">*</span></label>
                      <Input
                        placeholder="面板用户名"
                        value={newNode.user}
                        onChange={(e) => setNewNode({ ...newNode, user: e.target.value })}
                        required
                        className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">密码 <span className="text-red-500">*</span></label>
                      <Input
                        type="password"
                        placeholder="面板密码"
                        value={newNode.pass}
                        onChange={(e) => setNewNode({ ...newNode, pass: e.target.value })}
                        required
                        className="bg-white border-slate-200 rounded-xl h-12 text-slate-800"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText()
                        const parts = text.split('/')
                        if (parts.length >= 4) {
                          const urlParts = parts.slice(0, -3)
                          const basePath = parts[parts.length - 3]
                          const username = parts[parts.length - 2]
                          const password = parts[parts.length - 1]
                          const fullUrl = urlParts.join('/')
                          try {
                            const urlObj = new URL(fullUrl)
                            setNewNode({
                              alias: newNode.alias,
                              url: urlObj.origin,
                              base_path: '/' + basePath,
                              user: username,
                              pass: password
                            })
                          } catch {
                            setNewNode({ ...newNode, base_path: '/' + basePath, user: username, pass: password })
                          }
                          setClipToast({
                            show: true,
                            type: 'success',
                            message: '✅ 扫描成功！已自动填充表单\n\n💡 提示：格式为「地址/路径/用户名/密码」，复制时确保包含完整四部分'
                          })
                        } else {
                          setClipToast({
                            show: true,
                            type: 'error',
                            message: '❌ 格式错误：剪贴板内容不符合要求\n\n📋 正确格式：URL/基础路径/用户名/密码\n示例：https://example.com/abc/user/pass'
                          })
                        }
                      } catch {
                        setClipToast({
                          show: true,
                          type: 'error',
                          message: '❌ 无法读取剪贴板，请手动粘贴'
                        })
                      }
                    }}
                    className="w-full h-10 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
                  >
                    📋 扫描剪贴板自动填充
                  </Button>

                  {/* Clipboard toast */}
                  {clipToast.show && (
                    <div className={`fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4`}>
                      <div className={`bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl ${clipToast.type === 'success' ? 'border-4 border-green-400' : 'border-4 border-red-400'}`}>
                        <div className="text-center">
                          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${clipToast.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                            <span className="text-4xl font-bold ${clipToast.type === 'success' ? 'text-green-500' : 'text-red-500'}">{clipToast.type === 'success' ? '✓' : '✕'}</span>
                          </div>
                          <h3 className={`text-xl font-bold mb-3 ${clipToast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {clipToast.type === 'success' ? '扫描成功！' : '格式错误'}
                          </h3>
                          <p className="text-slate-700 text-base leading-relaxed whitespace-pre-line mb-6 font-medium">{clipToast.message}</p>
                          <Button
                            onClick={() => setClipToast({...clipToast, show: false})}
                            className={`w-full h-14 rounded-2xl text-lg font-bold ${clipToast.type === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-500 hover:bg-slate-600 text-white'}`}
                          >
                            确 定
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button type="submit" disabled={savingNode} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white h-12 rounded-xl">{savingNode ? "检测中..." : "保存"}</Button>
                    <Button type="button" variant="outline" onClick={() => setShowAdd(false)} className="flex-1 h-12 rounded-xl">取消</Button>
                  </div>
                </form>
              ) : loading ? (
                <div className="text-center py-12 text-slate-400">加载中...</div>
              ) : nodeCount === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Wifi className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-slate-500 mb-4">暂无节点</p>
                  <Button size="sm" onClick={() => setShowAdd(true)} className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl h-9 px-4">
                    <Plus className="w-4 h-4 mr-1" /> 添加节点
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(nodes).map(([id, info]) => (
                    <div
                      key={id}
                      onClick={() => selectedNode === id ? (setSelectedNode(null), setNodeDetail(null)) : openNodeDetail(id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-blue-100 hover:-translate-y-0.5 ${selectedNode === id ? "border-blue-400 bg-blue-50 shadow-md shadow-blue-100" : "border-slate-200 bg-white hover:border-blue-300"}`}
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
          {selectedNode && !showAdd && (
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
                  <button onClick={() => { setSelectedNode(null); setNodeDetail(null) }} className="p-2 text-slate-400 hover:text-slate-600 lg:hidden">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
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
                        <div key={inbound.id} className="border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all duration-200">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{inbound.remark || "入站 " + inbound.id}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">{(inbound.protocol || "未知").toUpperCase()}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${inbound.enable ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                                {inbound.enable ? "启用" : "禁用"}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteInbound({id: inbound.id, remark: inbound.remark || "入站 " + inbound.id})}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除入站"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Connection Info */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-slate-50 rounded-lg p-2.5">
                              <p className="text-xs text-slate-500 mb-1">服务器地址</p>
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-mono text-slate-700 truncate flex-1">{inbound.address || nodeDetail.host.replace(/^https?:\/\//, "")}</p>
                                <button onClick={() => copyToClipboard(inbound.address || nodeDetail.host, `addr-${inbound.id}`)} className="text-slate-400 hover:text-blue-500 flex-shrink-0">
                                  {copied === `addr-${inbound.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2.5">
                              <p className="text-xs text-slate-400 mb-0.5">端口</p>
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-mono text-slate-700">{inbound.port || "-"}</p>
                                <button onClick={() => copyToClipboard(String(inbound.port), `port-${inbound.id}`)} className="text-slate-400 hover:text-blue-500 flex-shrink-0">
                                  {copied === `port-${inbound.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Traffic */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-3">
                              <p className="text-xs text-green-600 mb-1">已上传</p>
                              <p className="text-base font-semibold text-green-700">{formatBytes(inbound.up)}</p>
                            </div>
                            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-3">
                              <p className="text-xs text-blue-600 mb-1">已下载</p>
                              <p className="text-base font-semibold text-blue-700">{formatBytes(inbound.down)}</p>
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
                                {inbound.clientStats.map((client, idx) => {
                                  const clientUuid = (client as any).uuid || ""
                                  const clientKey = `${inbound.id}||${clientUuid}`
                                  const link = clientUuid ? generateLink(inbound, nodeDetail.host, clientUuid, client.email) : ""
                                  const clientQRKey = `qr-${inbound.id}-${clientUuid}`
                                  return (
                                    <div key={clientUuid} className={`bg-slate-50 rounded-xl p-3 ${selectedClients.has(clientKey) ? 'ring-2 ring-blue-400' : ''}`}>
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
                                            <QrCode className="w-4 h-4" />
                                          </button>
                                          {link && (
                                            <button
                                              onClick={() => copyToClipboard(link, `link-${clientUuid}`)}
                                              className="text-slate-400 hover:text-blue-500 p-1"
                                            >
                                              {copied === `link-${clientUuid}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1 text-xs">
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
                                        <div className="flex flex-col items-center p-3 bg-white rounded-lg border border-slate-200 mt-2">
                                          <QRCodeSVG value={link} size={160} level="M" />
                                          <p className="text-xs text-slate-400 mt-2 text-center">扫描二维码导入节点</p>
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
                  <div className="text-center py-12 text-slate-400">加载失败</div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">确认删除</h3>
              <p className="text-slate-500">确定要删除该节点吗？此操作不可撤销。</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setShowDeleteModal(false)}
              >
                取消
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                onClick={confirmDelete}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">确认删除</h3>
              <p className="text-slate-500">确定要删除选中的 {bulkDeleteCount} 个用户吗？此操作不可撤销。</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setShowBulkDeleteModal(false)}
              >
                取消
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                onClick={confirmBulkDeleteClients}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Inbound Confirmation Modal */}
      {showDeleteInboundModal && inboundToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">确认删除入站</h3>
              <p className="text-slate-500">确定要删除入站 "{inboundToDelete.remark}" 吗？此操作将同时删除该入站下的所有用户，且不可撤销。</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setShowDeleteInboundModal(false)
                  setInboundToDelete(null)
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                onClick={confirmDeleteInbound}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
