export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">用户协议</h1>
          <p className="text-sm text-slate-500 mb-6">更新日期：2026年4月24日</p>
          <div className="overflow-y-auto max-h-[60vh] text-sm text-slate-600 leading-relaxed space-y-4 pr-2">
            <p>欢迎使用 X-HUB 服务（以下简称"本服务"）。在使用本服务之前，请仔细阅读本用户协议（以下简称"本协议"）。</p>
            <h3 className="font-semibold text-slate-800 mt-4">一、服务内容</h3>
            <p>X-HUB 是一个代理面板管理系统，用户可通过本服务管理其私有节点、入站配置和部署等操作。我们保留随时修改或中断服务的权利。</p>
            <h3 className="font-semibold text-slate-800 mt-4">二、用户义务</h3>
            <p>用户承诺在使用本服务时遵守当地法律法规，不得利用本服务从事任何违法活动。用户需对账户安全负责，因账户被盗用造成的损失由用户自行承担。</p>
            <h3 className="font-semibold text-slate-800 mt-4">三、隐私保护</h3>
            <p>我们重视用户隐私，用户的个人信息和使用数据将按照隐私政策进行保护。请参阅我们的隐私政策了解详情。</p>
            <h3 className="font-semibold text-slate-800 mt-4">四、服务变更</h3>
            <p>我们有权根据业务发展需要变更、中断或终止服务，并尽合理努力提前通知用户。因服务变更造成的损失，在法律允许范围内免责。</p>
            <h3 className="font-semibold text-slate-800 mt-4">五、免责声明</h3>
            <p>本服务按"现状"提供，不提供任何明示或暗示的保证。因不可抗力或第三方原因造成的服务中断，我们不承担责任。</p>
            <h3 className="font-semibold text-slate-800 mt-4">六、协议修改</h3>
            <p>我们有权随时修改本协议，修改后的协议一旦公布即生效。继续使用服务视为接受修改后的协议。</p>
            <h3 className="font-semibold text-slate-800 mt-4">七、联系我们</h3>
            <p>如对本协议有任何疑问，请通过邮件与我们联系。</p>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => window.history.back()} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-colors">
              关闭页面
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
