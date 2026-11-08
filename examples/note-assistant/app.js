import { connectAI } from "/sdk.js";
const $ = (id) => document.getElementById(id);
let ai;
$("connect").onclick = async () => {
  $("connect").disabled = true;
  try {
    ai = await connectAI({
      name: "Margin notes",
      purpose: "Summarize the note you submit and suggest three next steps.",
      requires: ["text"],
      onPairing: (p) => {
        $("pairing").hidden = false;
        $("code").textContent = p.verificationCode;
        $("open-connector").href = p.approvalUrl;
        $("status").textContent = "Waiting for approval in Bring AI…";
      },
    });
    $("pairing").hidden = true;
    $("connect").textContent = "AI connected ✓";
    $("generate").disabled = false;
    $("status").textContent = `Connected · ${ai.info.billing}`;
  } catch (e) {
    $("status").textContent = e.message;
    $("pairing").hidden = true;
  } finally {
    $("connect").disabled = false;
  }
};
$("generate").onclick = async () => {
  $("generate").disabled = true;
  $("status").textContent = "Your AI is making sense of the note…";
  try {
    const context = await (await fetch("/api/context")).json();
    const response = await ai.generate({
      messages: [
        { role: "developer", content: context.instruction },
        { role: "user", content: $("note").value },
      ],
    });
    $("result").textContent = response.output;
    $("result").style.whiteSpace = "pre-wrap";
    $("status").textContent =
      `From your ${response.provider} connection · ${response.remaining} requests left`;
  } catch (e) {
    $("status").textContent = e.message;
    if (e.code === "session_expired") {
      ai = null;
      $("connect").textContent = "Reconnect my AI ↗";
    }
  } finally {
    $("generate").disabled = !ai;
  }
};
