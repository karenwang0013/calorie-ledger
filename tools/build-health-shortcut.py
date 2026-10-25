#!/usr/bin/env python3
"""生成「健康采集」快捷指令：苹果健康四项 → 仓库 body.json。

用法：
    GH_TOKEN=ghp_xxx python3 tools/build-health-shortcut.py /输出目录

要点（改之前先读 HANDOFF-健康采集.md 第十节）：
- 「查找健康样本」的类型必须写在 WFContentItemFilter 谓词行里（Property=Type /
  Operator=4 / Values.Enumeration），顶层 WFHealthQuantityType 会被 iOS 忽略。
- 收尾不弹任何东西（既不要「显示结果」也不要「显示通知」）：数据在 PUT 那步就写完了，
  弹结果会在自动化里一直停着等人点；弹通知属于"有感"，用户会当成故障来报。
- 日期用的是「运行当天」（CurrentDate）—— 取样本开始日期那版在真机上会让流程「执行不完整」，已回退。
- 不写死 token：从环境变量 GH_TOKEN 取，仓库是公开的，脚本里不能带。
"""
import os
import plistlib
import sys
import uuid

GH_URL = "https://api.github.com/repos/karenwang0013/calorie-ledger/contents/body.json"


def U():
    return str(uuid.uuid4()).upper()


def ref(u, name):
    return {"Value": {"OutputUUID": u, "OutputName": name, "Type": "ActionOutput"},
            "WFSerializationType": "WFTextTokenAttachment"}


def tstr(text, attachments=None):
    d = {"string": text}
    if attachments:
        d["attachmentsByRange"] = {"{%d, 1}" % i: a for i, a in attachments.items()}
    return {"Value": d, "WFSerializationType": "WFTextTokenString"}


def act(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier,
            "WFWorkflowActionParameters": params}


def find_health(label):
    uid = U()
    return act("is.workflow.actions.filter.health.quantity", {
        "UUID": uid,
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Bounded": True, "Operator": 4, "Property": "Type",
                     "Removable": False,
                     "Values": {"Enumeration": {
                         "Value": label,
                         "WFSerializationType": "WFStringSubstitutableState"}}}
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Latest First",
        "WFContentItemLimitEnabled": True,
        "WFContentItemLimitNumber": 1,
    }), uid


def details(sample_uid, prop="Value"):
    """取样本的某一项属性；显式 WFInput 指回对应的「查找健康样本」。"""
    uid = U()
    return act("is.workflow.actions.properties.health.quantity", {
        "UUID": uid,
        "WFContentItemPropertyName": prop,
        "WFInput": ref(sample_uid, "Health Samples"),
    }), uid


def headers(token, extra=None):
    items = [
        {"WFItemType": 0, "WFKey": tstr("Authorization"),
         "WFValue": tstr("Bearer " + token)},
        {"WFItemType": 0, "WFKey": tstr("Accept"),
         "WFValue": tstr("application/vnd.github+json")},
    ]
    for k, v in (extra or {}).items():
        items.append({"WFItemType": 0, "WFKey": tstr(k), "WFValue": tstr(v)})
    return {"Value": {"WFDictionaryFieldValueItems": items},
            "WFSerializationType": "WFDictionaryFieldValue"}


def with_tokens(template, values):
    """把 values 顺序填进 template 里的 \\ufffc 占位符。"""
    att, pos = {}, 0
    for i, (tpl_i, val) in enumerate(zip(range(template.count("\ufffc")), values)):
        pos = template.index("\ufffc", pos)
        assert template[pos] == "\ufffc"
        att[pos] = val
        pos += 1
    assert len(att) == template.count("\ufffc")
    assert len(values) == template.count("\ufffc")
    return tstr(template, att)


def build(token, name="健康采集"):
    actions = []

    # 1) 体重值（日期先用「运行当天」，写法与线上能跑的「热量采集」一致：
    #    is.workflow.actions.format.date + CurrentDate。取样本开始日期那一步先不要，
    #    等真机确认能写进去了再加，避免一报错整条停住。）
    f1, f1u = find_health("Body Mass")
    actions.append(f1)
    d1, d1u = details(f1u)
    actions.append(d1)
    date_uid = U()
    actions.append(act("is.workflow.actions.format.date", {
        "UUID": date_uid,
        "WFDateFormatStyle": "Custom",
        "WFDateFormat": "yyyy-MM-dd",
        "WFDate": {"Value": {"Type": "CurrentDate"},
                   "WFSerializationType": "WFTextTokenAttachment"},
    }))

    # 2) 其余三项的值
    metrics = [("Body Fat Percentage", "bf"), ("Body Mass Index", "bmi"),
               ("Lean Body Mass", "ffm")]
    vals = {"w": (d1u, "Health Sample Details")}
    for label, key in metrics:
        f, fu = find_health(label)
        actions.append(f)
        d, du = details(fu)
        actions.append(d)
        vals[key] = (du, "Health Sample Details")

    # 3) 文本 JSON
    body = '{"d":"\ufffc","w":"\ufffc","bf":"\ufffc","bmi":"\ufffc","ffm":"\ufffc"}'
    json_uid = U()
    actions.append(act("is.workflow.actions.gettext", {
        "UUID": json_uid,
        "WFTextActionText": with_tokens(body, [
            ref(date_uid, "Formatted Date"),
            ref(*vals["w"]), ref(*vals["bf"]), ref(*vals["bmi"]), ref(*vals["ffm"]),
        ]),
    }))

    # 4) base64
    b64_uid = U()
    actions.append(act("is.workflow.actions.base64encode", {
        "UUID": b64_uid, "WFEncodeMode": "Encode", "WFBase64LineBreakMode": "None",
        "WFInput": ref(json_uid, "Text"),
    }))

    # 5) GET 拿 sha
    get_uid = U()
    actions.append(act("is.workflow.actions.downloadurl", {
        "UUID": get_uid, "WFURL": GH_URL, "WFHTTPMethod": "GET",
        "ShowHeaders": True, "Advanced": True,
        "WFHTTPHeaders": headers(token),
    }))

    sha_uid = U()
    actions.append(act("is.workflow.actions.getvalueforkey", {
        "UUID": sha_uid, "WFGetDictionaryValueType": "Value",
        "WFDictionaryKey": "sha", "WFInput": ref(get_uid, "Contents of URL"),
    }))

    # 6) PUT
    put_body = '{"message":"body sync","content":"\ufffc","sha":"\ufffc"}'
    put_txt_uid = U()
    actions.append(act("is.workflow.actions.gettext", {
        "UUID": put_txt_uid,
        "WFTextActionText": with_tokens(put_body, [
            ref(b64_uid, "Base64 Encoded"), ref(sha_uid, "Dictionary Value")]),
    }))
    actions.append(act("is.workflow.actions.downloadurl", {
        "UUID": U(), "WFURL": GH_URL, "WFHTTPMethod": "PUT",
        "ShowHeaders": True, "Advanced": True,
        "WFHTTPHeaders": headers(token, {"Content-Type": "application/json"}),
        "WFHTTPBodyType": "File",
        "WFRequestVariable": ref(put_txt_uid, "Text"),
    }))

    # 7) 不弹任何东西：数据在 PUT 那步就写完了，收尾留空才是「无感」

    return {
        "WFWorkflowActions": actions,
        # 必须跟真机当前「快捷指令」客户端版本一致，否则 iOS 会把导入的文件
        # 当成旧版本迁移 —— 表现就是变量变成「未知变量」、健康类型回落成「步数」。
        "WFWorkflowClientVersion": "5037.0.19",
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61440,
                           "WFWorkflowIconStartColor": 431817727},
        "WFWorkflowName": name,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFURLContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


if __name__ == "__main__":
    token = os.environ.get("GH_TOKEN", "").strip()
    if not token:
        sys.exit("缺 GH_TOKEN 环境变量")
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    wf = build(token)
    path = os.path.join(outdir, "health.plist")
    with open(path, "wb") as f:
        plistlib.dump(wf, f, fmt=plistlib.FMT_XML, sort_keys=False)
    print("wrote", path, len(wf["WFWorkflowActions"]), "actions")
