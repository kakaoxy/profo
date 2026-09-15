/**
 * 临时全矩阵走查（角色 × 现金 × 房源 90 组合自动走流程，验证无死胡同，跑完即删）.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialState, HOUSES, ROLES, SimState } from "../../pages/house-simulator/utils/constants";
import { derive } from "../../pages/house-simulator/utils/calc";
import { handleAction, HandlerCtx } from "../../pages/house-simulator/utils/handlers";
import { emptyModal, netModal, payModal, taxRiskModal, agreementModal } from "../../pages/house-simulator/utils/render";

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).wx = {
    showToast: () => {},
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  };
});

class FakePage {
  calls: string[] = [];
  data: Record<string, any> = {
    formCash: "80",
    custPrice: "360",
    custArea: "90",
    custRingValues: ["内", "外"],
    custRingIndex: 0,
    custTaxValues: ["new", "5u", "5n", "2n", "0n"],
    custTaxIndex: 0,
    modal: emptyModal(),
  };
  constructor(public S: SimState) {}
  setData(patch: Record<string, unknown>): void {
    for (const k of Object.keys(patch)) {
      if (k.indexOf(".") > 0) {
        const segs = k.split(".");
        let cur: Record<string, any> = this.data;
        for (let i = 0; i < segs.length - 1; i++) {
          if (cur[segs[i]] === undefined) cur[segs[i]] = {};
          cur = cur[segs[i]];
        }
        cur[segs[segs.length - 1]] = patch[k];
      } else {
        this.data[k] = patch[k];
      }
    }
  }
  nextScene(scene: string): void {
    this.S.scene = scene as SimState["scene"];
    this.calls.push("next:" + scene);
  }
  render(): void {}
  resetAll(): void { this.calls.push("resetAll"); }
  closeModal(): void { this.setData({ modal: emptyModal() }); }
  openCreditModal(): void { this.setData({ modal: { ...emptyModal(), type: "credit" } }); this.calls.push("modal:credit"); }
  openNetModal(): void { this.setData({ modal: netModal(this.S) }); this.calls.push("modal:net"); }
  openTaxModal(): void { this.setData({ modal: taxRiskModal(this.S) }); this.calls.push("modal:taxRisk"); }
  openAgreementModal(): void { this.setData({ modal: agreementModal() }); this.calls.push("modal:agreement"); }
  openPayModal(kind: "deposit" | "firstPay" | "restPay" | "transfer" | "holdback"): void {
    this.setData({ modal: payModal(this.S, kind) });
    this.calls.push("modal:pay");
  }
  openCalModal(to: string): void { this.calls.push("cal:" + to); }
  confirmRisk(type: string, _detail: string): void { this.calls.push("confirmRisk:" + type); }
  setupHouse(h: (typeof HOUSES)[number]): void {
    if (!this.S.role) this.S.role = ROLES.first;
    this.S.house = h;
    this.S.slash = 0;
    this.S.negoCap = false;
    this.S.netDeal = false;
    this.S.judge = null;
    this.S.ans = {};
    this.S.qaProg = 0;
    if (this.S.stress < 8) this.S.stress = 8;
    derive(this.S);
    this.S.scene = "qa";
    this.calls.push("setupHouse:" + h.id);
  }
}

function page(): FakePage {
  return new FakePage(createInitialState());
}
function run(p: FakePage, ...acts: string[]): void {
  for (const a of acts) handleAction(p as unknown as HandlerCtx, p.S, a);
}

const AGREE = ["signOk",
  "agrCheck:0", "agrCheck:1", "agrCheck:2", "agrCheck:3", "agrCheck:4", "agrCheck:5", "agrCheck:6", "agrCheck:7",
  "agrOk", "payOk"];

/** 以确定性策略自动走完全流程（选房 → 资格 → 砍价 → 成交 → 贷款 → 过户 → 交房 → 完成）. */
function walk(p: FakePage, houseId: string): "final" | "blocked" | "stuck" {
  const S = p.S;
  run(p, "role:" + (houseId === "X" ? "first" : S.role!.k));
  run(p, "cash:p" + p.S.cash / 10000);
  let currentId = houseId;
  let bounced = false; /* 借满仍缺 / 贷款被拒 → 换更便宜房源重走 */
  for (let step = 0; step < 80; step++) {
    const sc = S.scene;
    if (sc === "final") return "final";
    if (sc === "blocked") return "blocked";
    switch (sc) {
      case "select":
        if (bounced) currentId = "A"; /* 换最便宜房源（A）重走 */
        if (currentId === "X") { run(p, "pick:custom"); } else { run(p, "pick:" + currentId); }
        bounced = false;
        break;
      case "custom":
        run(p, "custOk");
        break;
      case "qa": {
        if (S.role!.k === "first") {
          run(p, "qa:hukou:non-sh", "qa:permit:yes");
        } else {
          run(p, "qa:hukou:non-sh", "qa:permit:no", "qa:years:m3p");
        }
        break;
      }
      case "nego1":
        run(p, "n1:chat");
        break;
      case "nego2":
        run(p, "n2:m5");
        break;
      case "nego3":
        if (S.negoCap) run(p, "negoAccept");
        else if (S.vat > 0 || S.sellerTax > 0) run(p, "n3NetNo");
        else run(p, "negoOk");
        break;
      case "feeNego":
        run(p, "fee2");
        break;
      case "loanType":
        run(p, "lt:combo", "ltOk");
        break;
      case "funds": {
        const gap = S.need - S.cash;
        if (gap > 0) run(p, "borrow");
        else run(p, "sign");
        break;
      }
      case "borrow": {
        const gap = S.need - S.cash;
        if (gap <= 0) { run(p, "sign"); break; }
        if (!S.usedBorrow.family) { run(p, "bor:family"); break; }
        if (!S.usedBorrow.gjj) { run(p, "bor:gjj"); break; }
        if (!S.usedBorrow.credit) { run(p, "bor:credit", "creditYes"); break; }
        /* 三条渠道已用仍缺 → 换更便宜房重走 */
        run(p, "changeHouse");
        bounced = true;
        break;
      }
      case "sign":
        run(p, ...AGREE);
        break;
      case "signNet":
        run(p, "signNetOk", "payOk");
        break;
      case "loan":
        run(p, "loanOk");
        break;
      case "loanChk": {
        const ok = S.loan.monthly <= 20000;
        if (ok) run(p, "lcOk");
        else { run(p, "lcChange"); bounced = true; } // 换更便宜房重走（验证无死胡同）
        break;
      }
      case "loanContract":
        run(p, "lcContractOk");
        if (p.data.modal.type === "pay") run(p, "payOk");
        break;
      case "transfer":
        run(p, "trDone");
        break;
      case "deed":
        run(p, S.taxed ? "deedOk" : "trOk");
        if (p.data.modal.type === "pay") run(p, "payOk");
        break;
      case "handover":
        run(p, "hoOk");
        break;
      case "settle":
        run(p, "stOk");
        if (p.data.modal.type === "pay") run(p, "payOk");
        break;
      case "renovStart": case "renovDesign": case "renovBudget": case "renovDemo":
      case "renovElec": case "renovSeal": case "renovTile": case "renovWood":
      case "renovPaint": case "renovMain": case "renovInstall": case "renovClean":
      case "renovAir": case "renovWarr":
        run(p, "renovSkip");
        break;
      default:
        return "stuck"; // 未覆盖场景 = 死胡同
    }
  }
  return "stuck";
}

describe("全矩阵走查：3 角色 × 5 现金档 × 6 预设房源 = 90 组合", () => {
  const roles: ("first" | "trade" | "invest")[] = ["first", "trade", "invest"];
  const cashes = [50, 70, 100, 200, 300];
  const ids = ["A", "B", "C", "D", "E", "F"];
  for (const role of roles) {
    for (const cashW of cashes) {
      for (const id of ids) {
        it(`走通：${role} · ${cashW} 万 · 房源 ${id}`, () => {
          const p = page();
          run(p, "role:" + role, "cash:p" + cashW);
          const res = walk(p, id);
          // 唯一允许的未走通态：限购拦截（blocked，有「换房/放弃」出口）
          expect(res === "final" || res === "blocked", `${role}/${cashW}/${id} → ${res} @scene=${p.S.scene}`).toBe(true);
          if (res === "final") {
            expect(p.S.cash).toBeGreaterThanOrEqual(0); // 全程现金不为负
          }
        });
      }
    }
  }
});
