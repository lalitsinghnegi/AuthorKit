/* AuthorKit style guide behaviour. Plain browser script: no build step, works from file://. */
(function () {
  "use strict";

  var doc = document;
  var classInfo = {};
  try {
    classInfo = JSON.parse(doc.getElementById("sg-classes").textContent || "{}");
  } catch {
    classInfo = {};
  }

  var toast = doc.querySelector(".sg-toast");
  var toastTimer;
  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.setAttribute("data-visible", "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.removeAttribute("data-visible");
    }, 1600);
  }

  /* ---- Copy ---- */
  function fallbackCopy(text) {
    var area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    try {
      doc.execCommand("copy");
    } catch {
      /* Nothing else to try. */
    }
    doc.body.removeChild(area);
  }

  function copy(text) {
    var done = function () {
      announce("Copied " + (text.length > 40 ? "to clipboard" : text));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
    }
    fallbackCopy(text);
    done();
    return Promise.resolve();
  }

  doc.addEventListener("click", function (event) {
    var button =
      event.target.closest && event.target.closest("[data-sg-copy], [data-sg-copy-from]");
    if (!button) return;
    var text = button.getAttribute("data-sg-copy");
    if (text === null) {
      var source = doc.getElementById(button.getAttribute("data-sg-copy-from"));
      text = source ? source.textContent : "";
    }
    copy(text);
  });

  /* ---- Search ---- */
  var search = doc.getElementById("sg-search");
  function filter(query) {
    var q = query.trim().toLowerCase();
    var anyVisible = false;
    doc.querySelectorAll(".sg-sidebar li").forEach(function (item) {
      var link = item.querySelector("a");
      var target = link && doc.querySelector(link.getAttribute("href"));
      var haystack =
        ((link && link.getAttribute("data-sg-search")) || "") +
        " " +
        ((target && target.getAttribute("data-sg-search")) || "") +
        " " +
        (link ? link.textContent.toLowerCase() : "");
      var match = !q || haystack.indexOf(q) !== -1;
      item.hidden = !match;
      if (target) target.hidden = !match;
      if (match) anyVisible = true;
    });
    var none = doc.querySelector(".sg-no-results");
    if (none) none.hidden = anyVisible;
  }
  if (search) {
    search.addEventListener("input", function () {
      filter(search.value);
    });
  }

  /* ---- Tabs ---- */
  function selectTab(tab) {
    var list = tab.closest("[role=tablist]");
    var group = list.parentElement;
    list.querySelectorAll("[role=tab]").forEach(function (t) {
      var selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      var panel = doc.getElementById(t.getAttribute("aria-controls"));
      if (panel && panel.parentElement === group) panel.hidden = !selected;
    });
  }
  doc.addEventListener("click", function (event) {
    var tab = event.target.closest && event.target.closest("[role=tab]");
    if (tab) selectTab(tab);
  });
  doc.addEventListener("keydown", function (event) {
    var tab = event.target.closest && event.target.closest("[role=tab]");
    if (!tab || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
    var tabs = Array.prototype.slice.call(
      tab.closest("[role=tablist]").querySelectorAll("[role=tab]"),
    );
    var next =
      tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });

  /* ---- Example frames ---- */
  var frames = Array.prototype.slice.call(doc.querySelectorAll("iframe.sg-frame"));

  function frameDocument(frame) {
    try {
      return frame.contentDocument;
    } catch {
      return null; /* Cross-origin (should not happen for srcdoc). */
    }
  }

  function fitHeight(frame) {
    var d = frameDocument(frame);
    if (!d || !d.documentElement) return;
    if (!d.body) return;
    // The body's own box: the document's scrollHeight never drops below the frame's current height.
    var height = Math.ceil(d.body.getBoundingClientRect().height);
    // Fixed-position components (the safety bar) are not part of the body's height, so keep a floor.
    var hasFixed = Array.prototype.some.call(d.body.querySelectorAll("*"), function (el) {
      return d.defaultView && d.defaultView.getComputedStyle(el).position === "fixed";
    });
    frame.style.height = Math.max(hasFixed ? 200 : 60, Math.min(height, 1400)) + "px";
  }

  function applyState(frame) {
    var state = frame.getAttribute("data-sg-state");
    var target = frame.getAttribute("data-sg-state-target");
    var d = frameDocument(frame);
    if (!state || !target || !d) return;
    try {
      d.querySelectorAll(target).forEach(function (el) {
        el.setAttribute("data-sg-state", state);
      });
    } catch {
      /* Invalid selector: show the default look. */
    }
  }

  var inspecting = false;
  var inspected = null;
  var inspector = doc.querySelector(".sg-inspector");

  function inspect(element) {
    if (inspected) inspected.style.outline = inspected.getAttribute("data-sg-outline") || "";
    inspected = element;
    element.setAttribute("data-sg-outline", element.style.outline || "");
    element.style.outline = "3px dashed #e8590c";
    var classes = Array.prototype.slice.call(element.classList);
    var body = inspector.querySelector(".sg-inspector-body");
    var rows = classes.length
      ? classes
          .map(function (c) {
            var info = classInfo[c];
            return (
              "<li><code>." +
              escapeHtml(c) +
              "</code> " +
              '<button type="button" class="sg-copy" data-sg-copy="' +
              escapeHtml(c) +
              '" aria-label="Copy class ' +
              escapeHtml(c) +
              '">Copy</button>' +
              (info
                ? "<br><small>" + escapeHtml(info.component + ": " + info.purpose) + "</small>"
                : "") +
              "</li>"
            );
          })
          .join("")
      : "<li>No classes on this element.</li>";
    body.innerHTML =
      "<p><code>&lt;" +
      escapeHtml(element.tagName.toLowerCase()) +
      "&gt;</code></p><ul>" +
      rows +
      "</ul>";
    inspector.hidden = false;
    announce(classes.length ? "Classes: " + classes.join(" ") : "No classes on this element");
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wireFrame(frame) {
    fitHeight(frame);
    applyState(frame);
    var d = frameDocument(frame);
    if (!d || d.__sgWired) return;
    d.__sgWired = true;
    d.addEventListener(
      "click",
      function (event) {
        if (!inspecting) {
          // Keep example links from navigating the frame away.
          if (event.target.closest && event.target.closest("a[href]")) event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        inspect(event.target);
      },
      true,
    );
  }

  frames.forEach(function (frame) {
    frame.addEventListener("load", function () {
      wireFrame(frame);
    });
    if (frame.contentDocument && frame.contentDocument.readyState === "complete") wireFrame(frame);
  });

  if (inspector) {
    inspector.querySelector(".sg-inspector-close").addEventListener("click", function () {
      inspector.hidden = true;
      if (inspected) inspected.style.outline = inspected.getAttribute("data-sg-outline") || "";
      inspected = null;
    });
  }

  var inspectToggle = doc.querySelector(".sg-inspect-toggle");
  if (inspectToggle) {
    inspectToggle.addEventListener("click", function () {
      inspecting = !inspecting;
      inspectToggle.setAttribute("aria-pressed", String(inspecting));
      announce(inspecting ? "Inspect mode on: click an element in an example" : "Inspect mode off");
    });
  }

  /* ---- Viewport ---- */
  function setViewport(width) {
    doc.querySelectorAll("[data-sg-viewport]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-sg-viewport") === String(width)));
    });
    frames.forEach(function (frame) {
      if (frame.closest(".sg-state")) return; // State grids stay narrow and side by side.
      frame.style.width = width + "px";
      setTimeout(function () {
        fitHeight(frame);
      }, 250);
    });
  }
  doc.querySelectorAll("[data-sg-viewport]").forEach(function (button) {
    button.addEventListener("click", function () {
      setViewport(Number(button.getAttribute("data-sg-viewport")));
    });
  });
  var initial = doc.querySelector('[data-sg-viewport][aria-pressed="true"]');
  if (initial) setViewport(Number(initial.getAttribute("data-sg-viewport")));

  // For tests and the browser console.
  window.AuthorKitStyleGuide = {
    copy: copy,
    filter: filter,
    setViewport: setViewport,
    inspect: inspect,
    setInspecting: function (on) {
      inspecting = on;
    },
  };
})();
