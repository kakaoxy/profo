import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 - 美房宝 | Profo",
  description: "美房宝隐私政策：我们如何收集、使用、存储与保护您的个人信息。",
};

/** 协议条款统一用美房宝主题排版：白底、Ink 标题、Ash 正文（对齐 DESIGN.md 语义 token）。 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <h1 className="text-2xl font-medium text-ink md:text-3xl">美房宝隐私政策</h1>
      <p className="mt-2 text-sm text-graphite">更新日期：2026年8月</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ash">
        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">一、引言</h2>
          <p>1.1 生效日期：本隐私政策自2026年8月起生效。</p>
          <p>
            1.2
            适用范围：本政策适用于美房宝（以下简称&ldquo;本平台&rdquo;或&ldquo;本服务&rdquo;
            ）在您使用过程中收集和处理您个人信息的行为。
          </p>
          <p>
            1.3
            合规声明：本平台依据《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》等相关法律法规制定本政策，我们将按照法律法规要求保护您的个人信息。
          </p>
          <p>1.4 请您在使用本服务前仔细阅读本政策。如您不同意本政策任何条款，请勿使用本服务。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">二、我们如何收集和使用您的个人信息</h2>
          <p>
            2.1
            账号注册：当您注册账号时，我们会收集您的用户名、密码（加密存储）、昵称（选填）与手机号（选填），用于创建账户与登录身份识别。
          </p>
          <p>
            2.2
            业务数据：当您使用估价、带看、装修托管等功能时，我们会记录您主动提交的信息，包括房源信息、估价记录、跟进记录等，用于为您提供相应服务及历史记录查询。
          </p>
          <p>
            2.3
            设备与日志信息：我们会收集您的操作系统类型、浏览器类型、访问时间等基础信息，用于服务运行优化与故障排查。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">三、我们如何使用 Cookie 和同类技术</h2>
          <p>
            3.1
            我们使用 Cookie 与本地存储维持您的登录状态、记住您的偏好设置，以便您下次访问时无需重新登录。
          </p>
          <p>3.2 您可通过浏览器设置管理或清除 Cookie；清除后可能需要重新登录。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">四、我们如何共享、转让、公开披露您的个人信息</h2>
          <p>
            4.1
            共享：为实现登录与消息通知功能，我们可能与服务提供商（如身份认证、短信服务）共享必要信息，并要求其按照本政策及法律法规处理。
          </p>
          <p>4.2 转让：我们不会将您的个人信息转让给任何第三方，除非获得您的另行同意。</p>
          <p>
            4.3 公开披露：我们仅会在法律法规明确要求或政府部门依法要求时，公开披露您的个人信息。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">五、我们如何保护您的个人信息</h2>
          <p>5.1 加密存储：我们对密码、手机号等敏感信息采用加密存储，防止信息泄露。</p>
          <p>5.2 访问控制：我们对内部访问个人信息的权限实行严格管控，仅授权人员可在必要范围内访问。</p>
          <p>
            5.3
            尽管我们采取了上述措施，但请您理解，互联网环境并非绝对安全，我们无法保证信息百分之百不被泄露。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">六、您的权利</h2>
          <p>6.1 查询与更正：您可在「我的」页面查询与修改您的个人资料。</p>
          <p>6.2 删除：您可删除您主动产生的业务数据（如估价记录），或联系我们处理。</p>
          <p>6.3 账号注销：您可通过联系我们注销账号。注销后我们将按照本政策处理或删除您的个人信息。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">七、我们如何处理未成年人的个人信息</h2>
          <p>7.1 本服务主要面向成年人。未成年人应在监护人陪同下使用本服务。</p>
          <p>
            7.2
            如我们发现在未取得监护人同意的情况下收集了未成年人的个人信息，我们将尽快删除相关信息。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">八、您的个人信息如何存储</h2>
          <p>8.1 我们在中华人民共和国境内收集和产生的个人信息，将存储于中华人民共和国境内。</p>
          <p>8.2 我们不会将您的个人信息转移至境外。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">九、本政策如何更新</h2>
          <p>
            9.1
            我们可能根据业务变化或法律法规要求更新本政策，更新后的政策将在本页面公布并更新生效日期。
          </p>
          <p>
            9.2
            对于重大变更，我们将通过页面公告或显著方式通知您。如您不同意更新后的政策，可停止使用本服务。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">十、联系我们</h2>
          <p>如对本政策有任何疑问或建议，您可通过页面表单或客服渠道与我们联系。</p>
        </section>

        <p className="pt-4 text-sm text-graphite">本平台运营团队 · 2026年8月</p>
      </div>
    </div>
  );
}
