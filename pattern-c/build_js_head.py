#!/usr/bin/env python3
"""2_css.css を、JS Head から <style> として差し込むスクリプトに変換して 3_js_head.html を作る。
Squad Beyond で CSS ペインが反映されない場合でもスタイルが当たるようにするため。"""
import json, pathlib, re
d = pathlib.Path(__file__).parent
css = (d / "2_css.css").read_text()
# 貼り付けやすいように圧縮（コメント削除・空白を詰める）
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
css = re.sub(r"\s+", " ", css)
css = re.sub(r"\s*([{};,])\s*", r"\1", css)
css = re.sub(r":\s+", ":", css).replace(";}", "}").strip()
tracking = (d / "3_js_head.tracking.html").read_text()
inject = f"""<!-- LPのCSS（CSSペインが反映されない場合の保険。2_css.css を圧縮して自動生成） -->
<script>
    (function() {{
        if (document.getElementById("mlc-lp-css")) return;
        var s = document.createElement("style");
        s.id = "mlc-lp-css";
        s.appendChild(document.createTextNode({json.dumps(css, ensure_ascii=False)}));
        (document.head || document.documentElement).appendChild(s);
    }})();
</script>
"""
notranslate = """<!-- 自動翻訳を止める（ブラウザに日本語ページとして扱わせ、英訳などに勝手に変換させない） -->
<meta name="google" content="notranslate">
<script>
    (function() {
        var h = document.documentElement;
        h.setAttribute("lang", "ja");
        h.setAttribute("translate", "no");
        h.classList.add("notranslate");
        if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
            var m = document.createElement("meta");
            m.name = "google";
            m.content = "notranslate";
            (document.head || h).appendChild(m);
        }
    })();
</script>

"""
(d / "3_js_head.html").write_text(notranslate + inject + "\n" + tracking)
