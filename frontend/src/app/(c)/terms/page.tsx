import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服务条款 - 美房宝 | Profo",
  description: "美房宝服务条款：账号注册、用户行为规范、服务说明与免责声明。",
};

/** 协议条款统一用美房宝主题排版：白底、Ink 标题、Ash 正文（对齐 DESIGN.md 语义 token）。 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <h1 className="text-2xl font-medium text-ink md:text-3xl">美房宝用户协议（服务条款）</h1>
      <p className="mt-2 text-sm text-graphite">更新日期：2026年8月</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ash">
        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">一、总则</h2>
          <p>
            1.1
            本协议是您与美房宝（以下简称&ldquo;本平台&rdquo;或&ldquo;本服务&rdquo;）之间就使用本平台网页服务所订立的协议。请您在使用本服务前仔细阅读并充分理解本协议全部内容。
          </p>
          <p>
            1.2
            本协议自您点击&ldquo;同意&rdquo;或以其他方式确认接受本协议、开始使用本服务之日起生效，对您与我们均具有约束力。如您不同意本协议任何条款，请勿注册或使用本服务。
          </p>
          <p>
            1.3 术语定义：&ldquo;我们&rdquo;指本平台运营主体；&ldquo;本服务&rdquo;
            指本平台向您提供的房源展示、估价预审、带看安排、装修托管等相关服务；&ldquo;用户&rdquo;
            指注册并使用本服务的自然人。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">二、账号注册与使用</h2>
          <p>
            2.1 注册资格：您应为具备完全民事行为能力的自然人。未成年人应在监护人陪同下使用本服务。
          </p>
          <p>2.2 注册方式：您通过用户名/密码方式完成注册，部分功能需要绑定手机号。</p>
          <p>2.3 账号安全：您应妥善保管账号信息，因主动泄露或保管不善导致的损失由您自行承担。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">三、用户行为规范</h2>
          <p>3.1 您在使用本服务时应遵守国家法律法规，不得利用本服务从事任何违法违规活动。</p>
          <p>
            3.2
            您不得发布虚假房源信息、干扰平台正常运行、侵犯他人合法权益，或以任何技术手段批量抓取、复制平台数据。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">四、服务说明与免责声明</h2>
          <p>
            4.1
            平台展示的房源信息、价格、面积（建筑面积口径）等来自房源登记信息，可能随市场情况调整，请以实地看房与合同约定为准。
          </p>
          <p>
            4.2
            平台提供的估价、测算工具（如按揭测算、投资测算）仅为参考性演示，不构成任何要约、投资建议或收益承诺；实际结果以交易各方签署的合同及银行、税务等机构核定为准。
          </p>
          <p>
            4.3
            装修托管服务的具体内容、费用、期限及未售出情形下的处理方式，以您与我们所签署的合同条款为准。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">五、协议的变更与终止</h2>
          <p>
            5.1
            我们可能根据业务变化或法律法规要求更新本协议，更新后的协议将在本页面公布。若您继续使用本服务，视为接受更新后的协议。
          </p>
          <p>5.2 您可随时停止使用本服务并注销账号；注销后本协议终止，但已产生的权利义务不受影响。</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-ink">六、联系我们</h2>
          <p>如对本协议有任何疑问或建议，您可通过页面表单或客服渠道与我们联系。</p>
        </section>

        <p className="pt-4 text-sm text-graphite">本平台运营团队 · 2026年8月</p>
      </div>
    </div>
  );
}
