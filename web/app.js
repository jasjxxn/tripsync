const DATA_URL = "../data/recipes.json";
const CAL_FACTORS = { carbs: 4, protein: 4, fat: 9 };
const TARGET_RATIOS = { carbs: 0.4, protein: 0.3, fat: 0.3 };
const RATIO_TOLERANCE = 0.1;

const state = {
  recipes: [],
  ready: false,
};

document.addEventListener("DOMContentLoaded", () => {
  loadRecipes();
  const form = document.querySelector("#ingredient-form");
  form.addEventListener("submit", handleSubmit);
});

async function loadRecipes() {
  const results = document.querySelector("#results");
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to load recipes (${response.status})`);
    }
    const payload = await response.json();
    state.recipes = payload.map(hydrateRecipe);
    state.ready = true;
  } catch (error) {
    results.innerHTML = `<p class="placeholder">Unable to load recipes: ${error.message}</p>`;
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (!state.ready) {
    renderPlaceholder("Still loading recipes. Please try again in a moment.");
    return;
  }
  const textarea = document.querySelector("#ingredient-input");
  const countInput = document.querySelector("#suggestion-count");
  const showMissing = document.querySelector("#show-missing").checked;

  const pantry = parseIngredients(textarea.value);
  if (!pantry.size) {
    renderPlaceholder("Add at least one ingredient to get suggestions.");
    return;
  }
  const limit = Math.min(10, Math.max(1, parseInt(countInput.value, 10) || 1));
  const scored = scoreRecipes(state.recipes, pantry, limit);
  if (!scored.length) {
    renderPlaceholder("No balanced recipes matched your ingredients yet. Try adding more items.");
    return;
  }
  renderResults(scored, pantry, showMissing);
}

function hydrateRecipe(data) {
  return {
    name: data.name,
    servings: data.servings ?? 1,
    coreIngredients: normalizeList(data.core_ingredients || []),
    supportingIngredients: normalizeList(data.supporting_ingredients || []),
    instructions: [...(data.instructions || [])],
    macros: data.macros || {},
    tags: data.tags || [],
    notes: data.notes || "",
  };
}

function normalizeList(items) {
  return items.map((item) => normalizeToken(item)).filter(Boolean);
}

function normalizeToken(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function parseIngredients(rawText) {
  const chunks = rawText.split(/[,;\n]/);
  const pantry = new Set();
  for (const chunk of chunks) {
    const normalized = normalizeToken(chunk);
    if (normalized) {
      pantry.add(normalized);
    }
  }
  return pantry;
}

function tokenize(phrase) {
  return phrase.split(" ").filter(Boolean);
}

function ingredientMatches(ingredient, pantry) {
  const ingredientTokens = tokenize(ingredient);
  if (!ingredientTokens.length) {
    return false;
  }
  for (const item of pantry) {
    const tokens = tokenize(item);
    if (!tokens.length) {
      continue;
    }
    const overlap = tokens.filter((token) => ingredientTokens.includes(token)).length;
    if (overlap === 0) {
      continue;
    }
    const coverage = overlap / Math.min(tokens.length, ingredientTokens.length);
    if (coverage >= 0.6) {
      return true;
    }
  }
  return false;
}

function ingredientScore(recipe, pantry) {
  if (!recipe.coreIngredients.length) {
    return 0;
  }
  const coreHits = recipe.coreIngredients.filter((item) => ingredientMatches(item, pantry)).length;
  const coreRatio = coreHits / recipe.coreIngredients.length;
  let supportingRatio = 0;
  if (recipe.supportingIngredients.length) {
    const supportingHits = recipe.supportingIngredients.filter((item) =>
      ingredientMatches(item, pantry),
    ).length;
    supportingRatio = supportingHits / recipe.supportingIngredients.length;
  }
  return coreRatio * 0.75 + supportingRatio * 0.25;
}

function macroRatios(recipe) {
  const macros = recipe.macros || {};
  const calories = Object.entries(CAL_FACTORS).reduce(
    (sum, [macro, factor]) => sum + (macros[macro] || 0) * factor,
    0,
  );
  if (calories <= 0) {
    return Object.fromEntries(Object.keys(TARGET_RATIOS).map((key) => [key, 0]));
  }
  return Object.fromEntries(
    Object.entries(TARGET_RATIOS).map(([macro]) => [
      macro,
      ((macros[macro] || 0) * CAL_FACTORS[macro]) / calories,
    ]),
  );
}

function balanceScore(recipe) {
  const ratios = macroRatios(recipe);
  const totalDelta = Object.entries(TARGET_RATIOS).reduce((sum, [macro, target]) => {
    const delta = Math.abs((ratios[macro] || 0) - target) / RATIO_TOLERANCE;
    return sum + delta;
  }, 0);
  const score = 1 - totalDelta / Object.keys(TARGET_RATIOS).length;
  return Math.max(0, Math.min(1, score));
}

function isBalanced(recipe) {
  const ratios = macroRatios(recipe);
  return Object.entries(TARGET_RATIOS).every(
    ([macro, target]) => Math.abs((ratios[macro] || 0) - target) <= RATIO_TOLERANCE,
  );
}

function scoreRecipes(recipes, pantry, limit) {
  const ranked = recipes
    .filter(isBalanced)
    .map((recipe) => {
      const coverage = ingredientScore(recipe, pantry);
      const balance = balanceScore(recipe);
      return {
        recipe,
        coverage,
        balance,
        score: coverage * 0.8 + balance * 0.2,
      };
    })
    .filter((entry) => entry.coverage > 0);
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

function formatMacros(macros = {}) {
  const order = ["carbs", "protein", "fat", "fiber"];
  return order
    .filter((macro) => macros[macro] !== undefined)
    .map((macro) => `${macro}: ${macros[macro]}g`)
    .join(", ");
}

function missingIngredients(recipe, pantry) {
  const missingCore = recipe.coreIngredients.filter((item) => !ingredientMatches(item, pantry));
  const missingSupport = recipe.supportingIngredients.filter(
    (item) => !ingredientMatches(item, pantry),
  );
  return { missingCore, missingSupport };
}

function renderResults(entries, pantry, showMissing) {
  const results = document.querySelector("#results");
  results.innerHTML = "";
  const template = document.querySelector("#recipe-template");

  entries.forEach((entry, index) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    clone.querySelector(".recipe-title").textContent = `${index + 1}. ${entry.recipe.name}`;
    clone.querySelector(".recipe-servings").textContent = `Serves ${entry.recipe.servings}`;
    clone.querySelector(".score-pill").textContent = `Score ${(entry.score * 100).toFixed(0)}%`;
    clone.querySelector(".recipe-tags").textContent =
      entry.recipe.tags?.length ? entry.recipe.tags.join(" · ") : "No tags";
    clone.querySelector(".recipe-macros").textContent = formatMacros(entry.recipe.macros);

    const stepsList = clone.querySelector(".recipe-steps");
    entry.recipe.instructions.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      stepsList.appendChild(li);
    });

    const missingBlock = clone.querySelector(".recipe-missing");
    const missingList = missingBlock.querySelector("ul");
    missingList.innerHTML = "";
    if (showMissing) {
      const { missingCore, missingSupport } = missingIngredients(entry.recipe, pantry);
      if (missingCore.length) {
        const li = document.createElement("li");
        li.textContent = `Core: ${missingCore.join(", ")}`;
        missingList.appendChild(li);
      }
      if (missingSupport.length) {
        const li = document.createElement("li");
        li.textContent = `Supporting: ${missingSupport.join(", ")}`;
        missingList.appendChild(li);
      }
      if (missingCore.length || missingSupport.length) {
        missingBlock.classList.remove("hidden");
      }
    }

    const notes = entry.recipe.notes?.trim();
    if (notes) {
      const notesElement = clone.querySelector(".recipe-notes");
      notesElement.textContent = `Notes: ${notes}`;
      notesElement.classList.remove("hidden");
    }

    results.appendChild(clone);
  });
}

function renderPlaceholder(message) {
  const results = document.querySelector("#results");
  results.innerHTML = `<p class="placeholder">${message}</p>`;
}
