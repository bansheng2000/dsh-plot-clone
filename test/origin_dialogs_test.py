# -*- coding: utf-8 -*-
"""origin_dialogs 判定表单测（纯函数，用假弹窗数据，不需要 Origin）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))
import origin_dialogs as d

fails = []
def ck(name, cond, got=None):
    if not cond:
        fails.append(f"{name}（实际 {got}）")
        print(f"FAIL {name}（实际 {got}）")

# 1) 中文助记符归一
ck("是(Y) → yes", d.normalize_button("是(Y)") == "yes", d.normalize_button("是(Y)"))
ck("否(N) → no", d.normalize_button("否(N)") == "no", d.normalize_button("否(N)"))
ck("&No → no", d.normalize_button("&No") == "no", d.normalize_button("&No"))
ck("取消 → cancel", d.normalize_button("取消") == "cancel", d.normalize_button("取消"))

# 2) 保存确认框：必须点「否」，绝不能点「是」
v = d.classify("OriginPro 2025b", "更改保存到项目: /文档 /deepseek-harness/.../all-watermark-fix?",
               ["是(Y)", "否(N)", "取消"])
ck("保存确认 → no", v["action"] == "no", v)
ck("保存确认点到 否(N)", v["button"] == "否(N)", v)

# 3) 覆盖确认：也不覆盖
v = d.classify("Origin", "文件已存在，要覆盖吗？", ["是(Y)", "否(N)"])
ck("覆盖 → no", v["action"] == "no", v)

# 4) 错误提示：点确定
v = d.classify("Origin", "错误：无法打开文件", ["确定"])
ck("错误 → ok", v["action"] == "ok", v)

# 5) 认不出的弹窗：不点
v = d.classify("Some Addin", "请选择模板", ["下一步", "完成"])
ck("未知 → 不点", v["action"] is None and v["kind"] == "unknown", v)

# 6) 只有「是/取消」的保存框：点取消，绝不点是
v = d.classify("Origin", "保存更改？", ["是(Y)", "取消"])
ck("只有是/取消 → cancel", v["action"] == "cancel", v)

print(f"dialogs 单测：{6 if not fails else 'FAILED'} 组 / 失败 {len(fails)}")
if fails:
    print("FAILED:", "; ".join(fails))
    sys.exit(1)
print("OK")
