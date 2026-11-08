import { connectAI } from "/sdk.js";
const $ = (id) => document.getElementById(id);
let ai;
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meal: { type: "string" },
    calories: { type: "number", minimum: 0 },
    protein: { type: "number", minimum: 0 },
    caveat: { type: "string" },
  },
  required: ["meal", "calories", "protein", "caveat"],
};
$("connect").onclick = async () => {
  $("connect").disabled = true;
  try {
    ai = await connectAI({
      name: "Daylight meal journal",
      purpose:
        "Estimate calories and protein from the meal description or photo you choose to submit.",
      requires: ["text", "image", "structuredOutput"],
      onPairing: (p) => {
        $("pairing").hidden = false;
        $("code").textContent = p.verificationCode;
        $("open-connector").href = p.approvalUrl;
        $("status").textContent = "Waiting for your approval in Bring AI…";
      },
    });
    $("pairing").hidden = true;
    $("connect").textContent = "AI connected ✓";
    $("generate").disabled = false;
    $("status").textContent =
      `Connected · ${ai.info.billing} · Session ends ${new Date(ai.info.expiresAt).toLocaleTimeString()}`;
  } catch (e) {
    $("status").textContent = e.message;
    $("connect").textContent = "Connect my AI ↗";
  } finally {
    $("connect").disabled = false;
  }
};
$("photo").onchange = () => {
  $("photo-name").textContent = $("photo").files[0]?.name || "";
};
$("generate").onclick = async () => {
  $("generate").disabled = true;
  $("status").textContent = "The app is preparing context…";
  try {
    const context = await (await fetch("/api/context")).json();
    let attachments = [];
    const file = $("photo").files[0];
    if (file) {
      if (file.size > 2000000) throw new Error("Choose an image under 2 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      attachments = [{ mime: file.type, data }];
    }
    $("status").textContent =
      "Your AI is estimating. App tools remain on the app’s server.";
    const response = await ai.generate({
      messages: [
        { role: "developer", content: context.instruction },
        { role: "user", content: $("meal").value },
      ],
      attachments,
      outputSchema: schema,
    });
    const output = response.output;
    $("result").replaceChildren();
    const title = document.createElement("h2");
    title.textContent = output.meal;
    const numbers = document.createElement("div");
    numbers.className = "numbers";
    const calories = document.createElement("div");
    const large = document.createElement("strong");
    large.textContent = Math.round(output.calories);
    calories.append(large, document.createTextNode("estimated kcal"));
    const protein = document.createElement("div");
    const grams = document.createElement("strong");
    grams.textContent = `${Math.round(output.protein)}g`;
    protein.append(grams, document.createTextNode("protein"));
    numbers.append(calories, protein);
    const caveat = document.createElement("p");
    caveat.textContent = output.caveat;
    const receipt = document.createElement("div");
    receipt.className = "receipt";
    receipt.textContent = `↗ From your ${response.provider} connection · ${response.remaining} requests left`;
    $("result").append(title, numbers, caveat, receipt);
    $("status").textContent =
      "Estimate received. Your app can now ask you to review and save it.";
  } catch (e) {
    $("status").textContent = e.message;
    if (e.code === "session_expired") {
      $("connect").textContent = "Reconnect my AI ↗";
      ai = null;
    }
  } finally {
    $("generate").disabled = !ai;
  }
};
