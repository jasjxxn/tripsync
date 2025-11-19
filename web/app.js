const DATA_URL = "../data/itineraries.json";
const MIN_DAYS = 3;
const MAX_DAYS = 10;
const SCHEDULE_ORDER = ["morning", "afternoon", "evening", "late"];

const state = {
  destinations: [],
  ready: false,
};

document.addEventListener("DOMContentLoaded", () => {
  loadDestinations();
  const form = document.querySelector("#planner-form");
  form.addEventListener("submit", handleSubmit);
});

async function loadDestinations() {
  const select = document.querySelector("#destination-select");
  const results = document.querySelector("#results");
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Unable to fetch itineraries (${response.status})`);
    }
    const payload = await response.json();
    state.destinations = payload;
    state.ready = true;
    populateDestinationSelect(select, payload);
  } catch (error) {
    results.innerHTML = `<p class="placeholder">${error.message}</p>`;
  }
}

function populateDestinationSelect(select, destinations) {
  const sorted = [...destinations].sort((a, b) => a.city.localeCompare(b.city));
  sorted.forEach((destination) => {
    const option = document.createElement("option");
    option.value = destination.id;
    option.textContent = `${destination.city}, ${destination.country}`;
    select.appendChild(option);
  });
}

function handleSubmit(event) {
  event.preventDefault();
  const results = document.querySelector("#results");
  if (!state.ready) {
    results.innerHTML = '<p class="placeholder">Still loading destination data. Try again shortly.</p>';
    return;
  }
  const destinationId = document.querySelector("#destination-select").value;
  if (!destinationId) {
    renderPlaceholder("Pick a destination to start planning.");
    return;
  }
  const destination = state.destinations.find((item) => item.id === destinationId);
  if (!destination) {
    renderPlaceholder("That destination is missing from the dataset. Try another city or update the JSON.");
    return;
  }
  const preferences = collectPreferences();
  const itinerary = buildItinerary(destination, preferences);
  renderItinerary(destination, itinerary);
}

function collectPreferences() {
  const lengthInput = document.querySelector("#trip-length");
  const rawLength = parseInt(lengthInput.value, 10);
  const tripLength = clamp(Number.isNaN(rawLength) ? MIN_DAYS : rawLength, MIN_DAYS, MAX_DAYS);
  const startValue = document.querySelector("#start-date").value;
  const startDate = startValue ? new Date(startValue) : null;
  const validStartDate = startDate && !Number.isNaN(startDate.valueOf()) ? startDate : null;
  const styleNodes = document.querySelectorAll('input[name="styles"]:checked');
  const styles = new Set(Array.from(styleNodes, (node) => node.value));
  const pace = document.querySelector('input[name="pace"]:checked')?.value || "balanced";
  return { tripLength, startDate: validStartDate, styles, pace };
}

function buildItinerary(destination, preferences) {
  const length = clamp(preferences.tripLength, MIN_DAYS, MAX_DAYS);
  const baseDays = Array.isArray(destination.days) ? destination.days : [];
  const flexDays = Array.isArray(destination.flexDays) ? destination.flexDays : [];
  const selected = baseDays.slice(0, Math.min(length, baseDays.length));
  if (selected.length < length) {
    const extras = pickFlexDays(flexDays, length - selected.length, preferences.styles);
    selected.push(...extras);
  }
  while (selected.length < length) {
    selected.push(createOpenExplorationDay(destination, preferences));
  }
  const meta = {
    length,
    pace: preferences.pace,
    startDate: preferences.startDate,
    paceNote: destination.paceNotes?.[preferences.pace] || "",
    bestSeasons: destination.bestSeasons || [],
    tags: destination.tags || [],
    requestedStyles: Array.from(preferences.styles),
    highlights: destination.highlights || [],
    localTips: destination.localTips || [],
  };
  return { days: selected, meta };
}

function pickFlexDays(flexDays, count, styles) {
  if (!flexDays.length || count <= 0) {
    return [];
  }
  const scored = flexDays.map((day) => ({
    day,
    score: styleMatchScore(day, styles),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((entry) => entry.day);
}

function styleMatchScore(day, styles) {
  if (!styles.size || !Array.isArray(day.style) || !day.style.length) {
    return 0;
  }
  const matches = day.style.filter((tag) => styles.has(tag));
  return matches.length;
}

function createOpenExplorationDay(destination, preferences) {
  const chosenStyle = preferences.styles.values().next().value || "flex";
  const highlight = destination.highlights?.[0] || destination.city;
  return {
    title: "Open exploration",
    focus: "Flex day",
    style: [chosenStyle],
    schedule: {
      morning: `Slow morning in ${destination.city} to revisit a favorite cafe or pick up last-minute gifts.`,
      afternoon: `Follow your curiosity toward ${chosenStyle} spots—ask locals for their latest recommendations.`,
      evening: "Keep the night open for spontaneous reservations or well-earned rest.",
    },
    meals: ["Brunch: Somewhere new", "Dinner: Your pick"],
    notes: `Use this flex slot to chase ${highlight.toLowerCase()} or add a final-day splurge.`,
  };
}

function renderItinerary(destination, itinerary) {
  const results = document.querySelector("#results");
  results.innerHTML = "";
  const card = document.createElement("article");
  card.className = "itinerary-card";

  const header = document.createElement("header");
  header.className = "itinerary-header";
  const title = document.createElement("h2");
  title.textContent = `${destination.city}, ${destination.country}`;
  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = destination.summary;
  header.appendChild(title);
  header.appendChild(summary);

  const metaGrid = buildMetaGrid(itinerary.meta);
  const highlightsSection = buildHighlights(destination.highlights);
  const dayList = buildDayList(itinerary.days, itinerary.meta.startDate);
  const tipsSection = buildTips(destination.localTips);

  card.appendChild(header);
  card.appendChild(metaGrid);
  if (highlightsSection) {
    card.appendChild(highlightsSection);
  }
  card.appendChild(dayList);
  if (tipsSection) {
    card.appendChild(tipsSection);
  }
  results.appendChild(card);
}

function buildMetaGrid(meta) {
  const dl = document.createElement("dl");
  dl.className = "meta-grid";
  addMetaRow(dl, "Trip length", `${meta.length} days`);
  if (meta.bestSeasons.length) {
    addMetaRow(dl, "Best seasons", meta.bestSeasons.join(" · "));
  }
  const styleText = meta.requestedStyles.length
    ? meta.requestedStyles.join(", ")
    : meta.tags.join(", ");
  if (styleText) {
    addMetaRow(dl, "Vibes", styleText);
  }
  if (meta.paceNote) {
    addMetaRow(dl, "Pace guide", meta.paceNote);
  } else {
    addMetaRow(dl, "Pace", meta.pace);
  }
  return dl;
}

function addMetaRow(dl, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  dl.appendChild(term);
  dl.appendChild(detail);
}

function buildHighlights(highlights = []) {
  if (!highlights.length) {
    return null;
  }
  const section = document.createElement("section");
  section.className = "highlights";
  const heading = document.createElement("h3");
  heading.textContent = "Highlights";
  const list = document.createElement("ul");
  highlights.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  section.appendChild(heading);
  section.appendChild(list);
  return section;
}

function buildDayList(days, startDate) {
  const wrapper = document.createElement("section");
  wrapper.className = "day-list";
  const template = document.querySelector("#day-template");
  days.forEach((day, index) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    clone.querySelector(".day-label").textContent = formatDayLabel(index, startDate);
    clone.querySelector(".day-title").textContent = day.title;
    clone.querySelector(".focus-tag").textContent = day.focus || "";
    const schedule = clone.querySelector(".schedule");
    renderSchedule(schedule, day.schedule);
    renderMeals(clone, day.meals);
    renderNotes(clone, day.notes);
    wrapper.appendChild(clone);
  });
  return wrapper;
}

function formatDayLabel(dayIndex, startDate) {
  const base = `Day ${dayIndex + 1}`;
  if (!startDate) {
    return base;
  }
  const date = new Date(startDate);
  date.setDate(date.getDate() + dayIndex);
  if (Number.isNaN(date.valueOf())) {
    return base;
  }
  const label = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${base} · ${label}`;
}

function renderSchedule(list, schedule = {}) {
  list.innerHTML = "";
  SCHEDULE_ORDER.forEach((slot) => {
    if (!schedule[slot]) {
      return;
    }
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = capitalize(slot);
    const description = document.createElement("p");
    description.textContent = schedule[slot];
    item.appendChild(label);
    item.appendChild(description);
    list.appendChild(item);
  });
}

function renderMeals(container, meals = []) {
  const mealBlock = container.querySelector(".meal-list");
  const mealList = mealBlock.querySelector("ul");
  mealList.innerHTML = "";
  if (!meals.length) {
    mealBlock.classList.add("hidden");
    return;
  }
  meals.forEach((meal) => {
    const item = document.createElement("li");
    item.textContent = meal;
    mealList.appendChild(item);
  });
  mealBlock.classList.remove("hidden");
}

function renderNotes(container, notes = "") {
  const noteElement = container.querySelector(".day-notes");
  if (!notes?.trim()) {
    noteElement.classList.add("hidden");
    return;
  }
  noteElement.textContent = notes;
  noteElement.classList.remove("hidden");
}

function buildTips(tips = []) {
  if (!tips.length) {
    return null;
  }
  const section = document.createElement("section");
  section.className = "tips";
  const heading = document.createElement("h3");
  heading.textContent = "Local intel";
  const list = document.createElement("ul");
  tips.forEach((tip) => {
    const li = document.createElement("li");
    li.textContent = tip;
    list.appendChild(li);
  });
  section.appendChild(heading);
  section.appendChild(list);
  return section;
}

function renderPlaceholder(message) {
  const results = document.querySelector("#results");
  results.innerHTML = `<p class="placeholder">${message}</p>`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function capitalize(text = "") {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
