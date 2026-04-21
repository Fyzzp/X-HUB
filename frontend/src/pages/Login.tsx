import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api, adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Login() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [showDisabledModal, setShowDisabledModal] = useState(false)
  const [registerEnabled, setRegisterEnabled] = useState(true)
  const [registerStatusLoading, setRegisterStatusLoading] = useState(true)
  useEffect(() => {
    if (localStorage.getItem("showDisabledModal") === "1") {
      setShowDisabledModal(true);
      localStorage.removeItem("showDisabledModal");
    }
  }, []);
  const handleCloseDisabledModal = () => {
    setShowDisabledModal(false);
    localStorage.removeItem("showDisabledModal");
  };

  useEffect(() => {
    const fetchRegisterStatus = async () => {
      try {
        const res = await adminApi.getRegisterStatus();
        if (res.code === 0) {
          setRegisterEnabled(res.data?.enabled ?? true);
        }
      } catch (err) {
      } finally {
        setRegisterStatusLoading(false);
      }
    };
    fetchRegisterStatus();
  }, []);

  const [fieldError, setFieldError] = useState<{ username?: string; email?: string; code?: string; password?: string; confirm?: string }>({})
  const [loading, setLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotStep, setForgotStep] = useState<"email" | "reset">("email")
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotCode, setForgotCode] = useState("")
  const [forgotPassword, setForgotPassword] = useState("")
  const [forgotConfirm, setForgotConfirm] = useState("")
  const [forgotError, setForgotError] = useState("")
  const [forgotFieldError, setForgotFieldError] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({})
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSendLoading, setForgotSendLoading] = useState(false)
  const [forgotCountdown, setForgotCountdown] = useState(0)
  const [forgotSuccess, setForgotSuccess] = useState(false)

  const validate = () => {
    const err: typeof fieldError = {}
    if (!username.trim()) err.username = "请输入用户名"
    else if (username.length < 3) err.username = "用户名至少3位"
    if (tab === "register") {
      if (!email.trim()) err.email = "请输入邮箱"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err.email = "邮箱格式不正确"
      if (!code.trim()) err.code = "请输入验证码"
      if (!password) err.password = "请输入密码"
      else if (password.length < 6) err.password = "密码至少6位"
      if (confirmPassword !== password) err.confirm = "两次密码不一致"
    } else {
      if (!password) err.password = "请输入密码"
    }
    setFieldError(err)
    return Object.keys(err).length === 0
  }

  const handleSendCode = async () => {
    if (!email.trim()) { setFieldError({ ...fieldError, email: "请输入邮箱" }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError({ ...fieldError, email: "邮箱格式不正确" }); return }
    setSendLoading(true)
    setFieldError({})
    try {
      await api.sendVerifyCode(email)
      setCodeSent(true)
      setCountdown(60)
      const t = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(t); return 0 }
          return c - 1
        })
      }, 1000)
    } catch (e: any) {
      setFieldError({ email: e.message || "发送失败" })
    } finally {
      setSendLoading(false)
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!validate()) return
    setLoading(true)
    try {
      if (tab === "login") {
        await api.login(username, password)
        const data = await api.me()
        if (data.is_admin) navigate("/admin")
        else navigate("/dashboard")
      } else {
        await api.registerWithCode(username, email, code, password)
        setTab("login")
        setEmail("")
        setCode("")
        setPassword("")
        setConfirmPassword("")
        setError("注册成功，请登录")
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const openForgotModal = () => {
    setShowForgot(true)
    setForgotStep("email")
    setForgotEmail("")
    setForgotCode("")
    setForgotPassword("")
    setForgotConfirm("")
    setForgotError("")
    setForgotFieldError({})
    setForgotSuccess(false)
  }

  const closeForgotModal = () => {
    setShowForgot(false)
    setForgotStep("email")
    setForgotEmail("")
    setForgotCode("")
    setForgotPassword("")
    setForgotConfirm("")
    setForgotError("")
    setForgotFieldError({})
    setForgotSuccess(false)
    setForgotCountdown(0)
  }

  const handleForgotSendCode = async () => {
    if (!forgotEmail.trim()) { setForgotFieldError({ ...forgotFieldError, email: "请输入邮箱" }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) { setForgotFieldError({ ...forgotFieldError, email: "邮箱格式不正确" }); return }
    setForgotSendLoading(true)
    setForgotFieldError({})
    try {
      await api.sendResetCode(forgotEmail)
      setForgotStep("reset")
      setForgotCountdown(60)
      const t = setInterval(() => {
        setForgotCountdown((c) => {
          if (c <= 1) { clearInterval(t); return 0 }
          return c - 1
        })
      }, 1000)
    } catch (e: any) {
      setForgotFieldError({ email: e.message || "发送失败" })
    } finally {
      setForgotSendLoading(false)
    }
  }

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError("")
    const err: typeof forgotFieldError = {}
    if (!forgotCode.trim()) err.code = "请输入验证码"
    if (!forgotPassword) err.password = "请输入新密码"
    else if (forgotPassword.length < 6) err.password = "密码至少6位"
    if (forgotConfirm !== forgotPassword) err.confirm = "两次密码不一致"
    if (Object.keys(err).length > 0) { setForgotFieldError(err); return }

    setForgotLoading(true)
    try {
      await api.resetPassword(forgotEmail, forgotCode, forgotPassword)
      setForgotSuccess(true)
      setTimeout(() => {
        closeForgotModal()
        setTab("login")
      }, 2000)
    } catch (e: any) {
      setForgotError(e.message)
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-100 to-blue-100 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-200/60 via-indigo-100/40 to-purple-100/30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl" />
        <div className="relative z-10 text-center px-12">
          <div className="w-24 h-24 bg-blue-500 rounded-[22px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/40 ring-8 ring-white/50">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-5xl font-bold text-slate-800 mb-4 tracking-tight">X-HUB</h1>
          <p className="text-slate-500 text-lg">专业的代理面板管理系统</p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-10">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 ring-4 ring-white/80">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-800">X-HUB</h1>
            <p className="text-slate-500 text-sm mt-2">专业的代理面板管理系统</p>
          </div>

          <div className="bg-white rounded-3xl p-10 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15),0_8px_25px_-5px_rgba(0,0,0,0.1),0_4px_10px_-6px_rgba(0,0,0,0.08)] ring-1 ring-slate-100">
            <div className="flex rounded-2xl bg-slate-100 p-1.5 mb-8">
              <button
                onClick={() => { setTab("login"); setError(""); setFieldError({}); setCodeSent(false) }}
                className={"flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-200 " + (tab === "login" ? "bg-white text-blue-600 shadow-md shadow-slate-200/80" : "text-slate-500 hover:text-slate-700")}
              >
                登录
              </button>
              {!registerStatusLoading && registerEnabled && (
                <button
                  onClick={() => { setTab("register"); setError(""); setFieldError({}) }}
                  className={"flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-200 " + (tab === "register" ? "bg-white text-blue-600 shadow-md shadow-slate-200/80" : "text-slate-500 hover:text-slate-700")}
                >
                  注册
                </button>
              )}
            </div>

            <form onSubmit={handleAuth} className="space-y-5" noValidate>
              <div>
                <Input
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setFieldError({ ...fieldError, username: undefined }) }}
                  className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (fieldError.username ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                />
                {fieldError.username && <p className="text-red-500 text-xs mt-1.5 pl-1">{fieldError.username}</p>}
              </div>

              {tab === "register" && (
                <>
                  <div>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="邮箱地址"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFieldError({ ...fieldError, email: undefined }); setCodeSent(false) }}
                        className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-28 " + (fieldError.email ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                      />
                      <button
                        type="button"
                        disabled={sendLoading || countdown > 0}
                        onClick={handleSendCode}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-700 font-semibold transition-colors disabled:text-slate-400 disabled:cursor-not-allowed h-8 px-3 rounded-lg hover:bg-blue-50 disabled:hover:bg-transparent"
                      >
                        {countdown > 0 ? countdown + "s" : codeSent ? "重新发送" : "发送验证码"}
                      </button>
                    </div>
                    {fieldError.email && <p className="text-red-500 text-xs mt-1.5 pl-1">{fieldError.email}</p>}
                  </div>

                  <div>
                    <Input
                      placeholder="验证码"
                      value={code}
                      onChange={(e) => { setCode(e.target.value); setFieldError({ ...fieldError, code: undefined }) }}
                      className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (fieldError.code ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                    />
                    {fieldError.code && <p className="text-red-500 text-xs mt-1.5 pl-1">{fieldError.code}</p>}
                  </div>
                </>
              )}

              <div>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldError({ ...fieldError, password: undefined }) }}
                    className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-24 " + (fieldError.password ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                  />
                  {tab === "login" && (
                    <button
                      type="button"
                      onClick={openForgotModal}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                    >
                      忘记密码?
                    </button>
                  )}
                </div>
                {fieldError.password && <p className="text-red-500 text-xs mt-1.5 pl-1">{fieldError.password}</p>}
              </div>

              {tab === "register" && (
                <div>
                  <Input
                    type="password"
                    placeholder="确认密码"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setFieldError({ ...fieldError, confirm: undefined }) }}
                    className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (fieldError.confirm ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                  />
                  {fieldError.confirm && <p className="text-red-500 text-xs mt-1.5 pl-1">{fieldError.confirm}</p>}
                </div>
              )}

              {error && !error.includes("禁用") && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm text-center py-2.5 rounded-xl">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white h-12 rounded-xl font-semibold shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all text-sm"
              >
                {loading ? "处理中..." : (tab === "login" ? "登录" : "注册")}
              </Button>
            </form>

            <div className="text-center mt-6">
              {tab === "login" ? (
                <p className="text-sm text-slate-500">
                  没有账号?{!registerStatusLoading && registerEnabled && <button onClick={() => { setTab("register"); setError(""); setFieldError({}) }} className="text-blue-500 hover:text-blue-700 font-semibold ml-1 transition-colors">去注册</button>}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  已有账号?<button onClick={() => { setTab("login"); setError(""); setFieldError({}); setCodeSent(false) }} className="text-blue-500 hover:text-blue-700 font-semibold ml-1 transition-colors">去登录</button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">找回密码</h2>
              <button onClick={closeForgotModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {forgotSuccess ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-green-600 font-semibold text-lg mb-2">密码重置成功</p>
                <p className="text-slate-500 text-sm">即将跳转到登录页面...</p>
              </div>
            ) : forgotStep === "email" ? (
              <div className="space-y-5">
                <p className="text-slate-500 text-sm">请输入您注册时使用的邮箱地址</p>
                <div>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="邮箱地址"
                      value={forgotEmail}
                      onChange={(e) => { setForgotEmail(e.target.value); setForgotFieldError({ ...forgotFieldError, email: undefined }) }}
                      className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-28 " + (forgotFieldError.email ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                    />
                    <button
                      type="button"
                      disabled={forgotSendLoading || forgotCountdown > 0}
                      onClick={handleForgotSendCode}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-700 font-semibold transition-colors disabled:text-slate-400 disabled:cursor-not-allowed h-8 px-3 rounded-lg hover:bg-blue-50 disabled:hover:bg-transparent"
                    >
                      {forgotCountdown > 0 ? forgotCountdown + "s" : "发送验证码"}
                    </button>
                  </div>
                  {forgotFieldError.email && <p className="text-red-500 text-xs mt-1.5 pl-1">{forgotFieldError.email}</p>}
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotReset} className="space-y-5">
                <p className="text-green-600 text-sm font-medium">验证码已发送到 {forgotEmail}</p>
                <div>
                  <Input
                    placeholder="验证码"
                    value={forgotCode}
                    onChange={(e) => { setForgotCode(e.target.value); setForgotFieldError({ ...forgotFieldError, code: undefined }) }}
                    className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (forgotFieldError.code ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                  />
                  {forgotFieldError.code && <p className="text-red-500 text-xs mt-1.5 pl-1">{forgotFieldError.code}</p>}
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder="新密码（至少6位）"
                    value={forgotPassword}
                    onChange={(e) => { setForgotPassword(e.target.value); setForgotFieldError({ ...forgotFieldError, password: undefined }) }}
                    className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (forgotFieldError.password ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                  />
                  {forgotFieldError.password && <p className="text-red-500 text-xs mt-1.5 pl-1">{forgotFieldError.password}</p>}
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder="确认新密码"
                    value={forgotConfirm}
                    onChange={(e) => { setForgotConfirm(e.target.value); setForgotFieldError({ ...forgotFieldError, confirm: undefined }) }}
                    className={"bg-slate-50 border-slate-200 rounded-xl h-12 text-slate-800 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all " + (forgotFieldError.confirm ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "")}
                  />
                  {forgotFieldError.confirm && <p className="text-red-500 text-xs mt-1.5 pl-1">{forgotFieldError.confirm}</p>}
                </div>
                {forgotError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm text-center py-2.5 rounded-xl">
                    {forgotError}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white h-12 rounded-xl font-semibold shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all text-sm"
                >
                  {forgotLoading ? "处理中..." : "重置密码"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setForgotStep("email"); setForgotCode(""); setForgotPassword(""); setForgotConfirm(""); setForgotFieldError({}) }}
                  className="w-full text-slate-500 text-sm hover:text-slate-700 transition-colors"
                >
                  返回重新输入邮箱
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {showDisabledModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">账户已被禁用</h3>
              <p className="text-slate-500 mb-6">您的账户已被禁用，请联系管理员解除封禁后重新登录。</p>
              <button
                onClick={handleCloseDisabledModal}
                className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
