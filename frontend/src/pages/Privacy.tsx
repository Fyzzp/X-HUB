export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">隐私政策</h1>
          <p className="text-sm text-slate-500 mb-6">更新日期：2026年4月24日</p>
          <div className="overflow-y-auto max-h-[60vh] text-sm text-slate-600 leading-relaxed space-y-4 pr-2">
            <p>我们非常重视您的个人隐私。本隐私政策说明了我们如何收集、使用、存储和保护您的信息。</p>
            <h3 className="font-semibold text-slate-800 mt-4">一、信息收集</h3>
            <p>我们收集您主动提供的信息，包括注册账户时的用户名、邮箱地址，以及使用服务时产生的操作日志（审计日志）。审计日志包含操作类型、时间、IP 地址等信息，用于安全分析和问题排查。</p>
            <h3 className="font-semibold text-slate-800 mt-4">二、信息使用</h3>
            <p>我们使用收集的信息用于：提供和改进服务、保障账户安全、响应用户请求、分析服务使用情况。我们不会将您的个人信息用于广告推送或与第三方共享（法律要求除外）。</p>
            <h3 className="font-semibold text-slate-800 mt-4">三、数据存储</h3>
            <p>您的数据存储在加密的数据库中，访问权限受到严格控制。我们采取合理的安全措施保护您的数据，但互联网传输无法保证 100% 安全。</p>
            <h3 className="font-semibold text-slate-800 mt-4">四、Cookie</h3>
            <p>我们使用 Cookie 维持登录状态和记住您的偏好设置。您可以通过浏览器设置拒绝 Cookie，但这可能影响部分功能。</p>
            <h3 className="font-semibold text-slate-800 mt-4">五、信息共享</h3>
            <p>除以下情况外，我们不会与第三方共享您的个人信息：(1) 获得您的明确同意；(2) 法律法规要求；(3) 保护我们的合法权益。</p>
            <h3 className="font-semibold text-slate-800 mt-4">六、用户权利</h3>
            <p>您有权查看、修改或删除您的个人信息。如需删除账户，请联系我们。删除后部分信息可能因法律义务保留一段时间。</p>
            <h3 className="font-semibold text-slate-800 mt-4">七、联系我们</h3>
            <p>如对本隐私政策有任何疑问，请通过邮件与我们联系。</p>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => window.close()} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-colors">
              关闭页面
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
