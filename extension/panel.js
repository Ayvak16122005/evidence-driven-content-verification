const API = "http://127.0.0.1:8000";

let mode = "text";
let last = "";
let currentAudio = null;


const $ = function (id) {
  return document.getElementById(id);
};


function esc(value) {
  return String(value || "").replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c];
  });
}


function say(message) {
  if ($("speech")) {
    $("speech").textContent = message;
  }
}


// ==================================================
// API
// ==================================================

function api(path, options) {
  return fetch(API + path, options || {}).then(function (response) {

    if (!response.ok) {
      return response.text().then(function (text) {
        throw new Error(text || ("HTTP " + response.status));
      });
    }

    return response.json();
  });
}


// ==================================================
// MODE BUTTONS
// ==================================================

function setMode(newMode) {

  mode = newMode;

  document.querySelectorAll(".modes button").forEach(function (button) {
    button.classList.toggle(
      "sel",
      button.dataset.mode === newMode
    );
  });

  $("text").classList.toggle(
    "hide",
    newMode !== "text" && newMode !== "page"
  );

  $("url").classList.toggle(
    "hide",
    newMode !== "url"
  );

  $("file").classList.toggle(
    "hide",
    newMode !== "file"
  );

  if (newMode === "page") {
    $("text").placeholder =
      "Mailon will read the current webpage...";
    say("Ready to inspect this page. 🌐");
  }

  if (newMode === "text") {
    $("text").placeholder =
      "Paste a claim, job, email, ad or message...";
    say("Tell me what you want me to verify. ✨");
  }

  if (newMode === "url") {
    say("Give me a webpage URL to investigate. 🔗");
  }

  if (newMode === "file") {
    say("Choose a document or image. 📎");
  }
}


document.querySelectorAll(".modes button").forEach(function (button) {

  button.onclick = function () {
    setMode(button.dataset.mode);
  };

});


// ==================================================
// TABS
// ==================================================

document.querySelectorAll(".tab").forEach(function (button) {

  button.onclick = function () {

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.classList.remove("active");
    });

    button.classList.add("active");

    $("verify").classList.toggle(
      "hide",
      button.dataset.tab !== "verify"
    );

    $("search").classList.toggle(
      "hide",
      button.dataset.tab !== "search"
    );
  };

});


// ==================================================
// CLOSE
// ==================================================

$("close").onclick = function () {
  say("Bye! Stay curious and verify before you trust. 🐾");
};


// ==================================================
// RENDER
// ==================================================

function render(data) {

  last = [
    data.summary,
    data.explanation,
    data.advice
  ]
    .filter(Boolean)
    .join("\n\n");

  var evidence = Array.isArray(data.evidence)
    ? data.evidence
    : [];

  var warnings = Array.isArray(data.warnings)
    ? data.warnings
    : [];

  $("result").innerHTML = `
    <div class="box">

      <b>${esc(data.verdict || "Result")}</b>

      <div class="score">
        ${esc(data.trust_score || "—")}/100
      </div>

      <p>
        <b>Summary</b><br>
        ${esc(data.summary || "No summary available.")}
      </p>

      <p>
        <b>Why</b><br>
        ${esc(data.explanation || "No explanation available.")}
      </p>

      <p>
        <b>Advice</b><br>
        ${esc(data.advice || "No advice available.")}
      </p>

      ${
        warnings.length
          ? `
            <b>Warnings</b>
            <ul>
              ${warnings.map(function (item) {
                return "<li>" + esc(item) + "</li>";
              }).join("")}
            </ul>
          `
          : ""
      }

      <h4>
        Evidence (${esc(data.evidence_count || evidence.length)})
      </h4>

      ${
        evidence.length
          ? evidence.map(function (item) {
              return `
                <div class="source">
                  <a
                    href="${esc(item.url || "#")}"
                    target="_blank"
                  >
                    ${esc(item.title || "Source")}
                  </a>
                  <br>
                  ${esc(item.snippet || "")}
                </div>
              `;
            }).join("")
          : "<p>No evidence sources returned.</p>"
      }

    </div>
  `;

  say(
    "I checked the available evidence. You make the final decision. ✨"
  );
}


// ==================================================
// CURRENT PAGE
// ==================================================

function getCurrentPage() {

  return chrome.tabs.query({
    active: true,
    currentWindow: true
  }).then(function (tabs) {

    var tab = tabs && tabs[0];

    if (!tab || !tab.id) {
      throw new Error("Could not find the current browser tab.");
    }

    return chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },

      func: function () {

        return {
          title: document.title || "",
          url: location.href || "",
          text: (
            document.body && document.body.innerText
              ? document.body.innerText
              : ""
          ).slice(0, 25000)
        };

      }
    });

  }).then(function (results) {

    return results && results[0]
      ? results[0].result
      : {};

  }).catch(function (error) {

    console.error("Page extraction error:", error);

    throw new Error(
      "I cannot read this page. Try a normal webpage."
    );

  });
}


// ==================================================
// ASK MAILON
// ==================================================

$("analyze").onclick = function () {

  $("result").innerHTML = `
    <div class="box">
      🐾 Mailon is searching for evidence...
    </div>
  `;

  say("Checking evidence... 🔎");

  var requestOptions;


  // FILE
  if (mode === "file") {

    var file = $("file").files[0];

    if (!file) {
      $("result").innerHTML =
        '<div class="error">Please choose a file or image first.</div>';

      say("Please choose a file first.");
      return;
    }

    var formData = new FormData();

    formData.append("file", file);
    formData.append("category", $("category").value);
    formData.append("language", $("language").value);

    requestOptions = {
      method: "POST",
      body: formData
    };

    api("/api/analyze-file", requestOptions)
      .then(render)
      .catch(showError);

    return;
  }


  // PAGE
  if (mode === "page") {

    getCurrentPage()

      .then(function (page) {

        if (!page.text || !page.text.trim()) {
          throw new Error(
            "No readable text was found on this webpage."
          );
        }

        return api("/api/analyze", {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            text: page.text,
            url: page.url,
            category: $("category").value,
            language: $("language").value
          })
        });

      })

      .then(render)
      .catch(showError);

    return;
  }


  // TEXT / URL

  var text = $("text").value.trim();
  var url = $("url").value.trim();

  if (mode === "text" && !text) {
    showError(new Error("Please enter some text to verify."));
    return;
  }

  if (mode === "url" && !url) {
    showError(new Error("Please enter a URL to verify."));
    return;
  }

  requestOptions = {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      text: text,
      url: url,
      category: $("category").value,
      language: $("language").value
    })
  };

  api("/api/analyze", requestOptions)
    .then(render)
    .catch(showError);
};


function showError(error) {

  console.error("Mailon error:", error);

  $("result").innerHTML = `
    <div class="error">
      ${esc(error.message || "Something went wrong.")}
    </div>
  `;

  say("I hit a problem. Please check the message above.");
}


// ==================================================
// VERIFIED SEARCH
// ==================================================

$("searchBtn").onclick = function () {

  var query = $("query").value.trim();

  if (!query) {
    say("Tell me what verified information you need. 🔎");
    return;
  }

  $("searchResult").innerHTML =
    '<div class="box">🔎 Searching...</div>';

  api("/api/verified-search", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      query: query,
      language: $("language").value
    })

  })

    .then(function (data) {

      last = data.answer || "";

      var results = Array.isArray(data.results)
        ? data.results
        : [];

      $("searchResult").innerHTML = `
        <div class="box">

          <p>${esc(data.answer || "")}</p>

          ${
            results.map(function (item) {
              return `
                <div class="source">
                  <a
                    href="${esc(item.url || "#")}"
                    target="_blank"
                  >
                    ${esc(item.title || "Source")}
                  </a>
                  <br>
                  ${esc(item.snippet || "")}
                </div>
              `;
            }).join("")
          }

        </div>
      `;

      say("I found some evidence for you. ✨");

    })

    .catch(function (error) {

      $("searchResult").innerHTML =
        '<div class="error">' +
        esc(error.message) +
        "</div>";

    });
};


// ==================================================
// VOICE INPUT
// ==================================================

$("mic").onclick = function () {

  navigator.mediaDevices.getUserMedia({
    audio: true
  })

    .then(function (stream) {

      var recorder = new MediaRecorder(stream);
      var chunks = [];

      recorder.ondataavailable = function (event) {

        if (event.data.size > 0) {
          chunks.push(event.data);
        }

      };


      recorder.onstop = function () {

        stream.getTracks().forEach(function (track) {
          track.stop();
        });

        say("Processing your voice... 🐾");

        var formData = new FormData();

        formData.append(
          "file",
          new Blob(chunks, {
            type: "audio/webm"
          }),
          "mailon.webm"
        );

        formData.append("mode", "transcribe");

        api("/api/stt", {
          method: "POST",
          body: formData
        })

          .then(function (data) {

            $("text").value =
              data.transcript || "";

            setMode("text");

            say("I heard you. Ready to check it. ✨");

          })

          .catch(function () {
            say("I couldn't process the recording.");
          });

      };


      recorder.start();

      say("🎙️ Listening for 6 seconds...");

      setTimeout(function () {

        if (recorder.state !== "inactive") {
          recorder.stop();
        }

      }, 6000);

    })

    .catch(function () {
      say("Microphone unavailable or permission was blocked.");
    });
};


// ==================================================
// SPEAK
// ==================================================

$("speak").onclick = function () {

  if (!last) {
    say("Ask me something first.");
    return;
  }

  // Resume paused audio
  if (
    currentAudio &&
    currentAudio.paused &&
    currentAudio.currentTime > 0
  ) {

    currentAudio.play();

    say("🔊 Speaking...");

    return;
  }


  // Already speaking
  if (
    currentAudio &&
    !currentAudio.paused
  ) {

    say("I'm already speaking. 🐾");

    return;
  }


  say("Preparing my voice... 🔊");

  var formData = new FormData();

  formData.append(
    "text",
    last.slice(0, 2400)
  );

  formData.append(
    "language",
    $("language").value
  );


  api("/api/tts", {
    method: "POST",
    body: formData
  })

    .then(function (data) {

      var bytes = Uint8Array.from(
        atob(data.audio_base64),
        function (c) {
          return c.charCodeAt(0);
        }
      );


      var blob = new Blob(
        [bytes],
        {
          type: "audio/wav"
        }
      );


      var audioUrl = URL.createObjectURL(blob);

      currentAudio = new Audio(audioUrl);


      currentAudio.onended = function () {

        say("Finished speaking. 🐾");

        URL.revokeObjectURL(audioUrl);

        currentAudio = null;
      };


      currentAudio.onpause = function () {

        if (
          currentAudio &&
          currentAudio.currentTime > 0 &&
          !currentAudio.ended
        ) {

          say("⏸ Speech paused.");

        }

      };


      return currentAudio.play();

    })

    .then(function () {

      say("🔊 Speaking...");

    })

    .catch(function (error) {

      console.error("TTS error:", error);

      say("Voice output failed.");

    });

};


// ==================================================
// PAUSE SPEECH
// ==================================================

$("pauseSpeech").onclick = function () {

  if (!currentAudio) {

    say("Nothing is speaking right now. 🐾");

    return;
  }


  if (currentAudio.paused) {

    say("Speech is already paused. ⏸");

    return;
  }


  currentAudio.pause();

  say("⏸ Speech paused.");

};


// ==================================================
// STOP SPEECH
// ==================================================

$("stopSpeech").onclick = function () {

  if (!currentAudio) {

    say("Nothing is speaking right now. 🐾");

    return;
  }


  currentAudio.pause();

  currentAudio.currentTime = 0;

  say("⏹ Speech stopped.");

  currentAudio = null;

};


// ==================================================
// TRANSLATE
// ==================================================

$("translate").onclick = function () {

  if (!last) {

    say("Ask me something first.");

    return;
  }


  say("Translating... 🌍");


  api("/api/translate", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({

      text: last.slice(0, 950),

      target_language: $("language").value,

      source_language: "auto"

    })

  })


    .then(function (data) {

      last = data.translated_text || "";


      $("result").innerHTML = `
        <div class="box">

          <b>Translation</b>

          <p>
            ${esc(last)}
          </p>

        </div>
      `;


      say("Translation complete. 🌍✨");

    })


    .catch(function (error) {

      console.error("Translation error:", error);

      say("Translation failed.");

    });

};


// ==================================================
// SAVED SELECTION
// ==================================================

chrome.storage.local.get(
  ["mailonSelection"],
  function (data) {

    if (data && data.mailonSelection) {

      $("text").value =
        data.mailonSelection;

      setMode("text");

      chrome.storage.local.remove(
        ["mailonSelection"]
      );

    }

  }
);


// ==================================================
// START
// ==================================================

setMode("text");

say(
  "Hi! I'm Mailon. What would you like me to verify? 🐾"
);