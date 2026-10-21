#!/usr/bin/env python3
"""2_css.css を、JS Head から <style> として差し込むスクリプトに変換して 3_js_head.html を作る。
Squad Beyond で CSS ペインが反映されない場合でもスタイルが当たるようにするため。"""
import json, pathlib
d = pathlib.Path(__file__).parent
css = (d / "2_css.css").read_text()
tracking = (d / "3_js_head.tracking.html").read_text()
inject = f"""<!-- LPのCSS（CSSペインが反映されない環境向けにスクリプトから差し込む。2_css.css から自動生成） -->
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
(d / "3_js_head.html").write_text(inject + "\n" + tracking)
