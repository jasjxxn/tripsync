# TripSync Recipe Book

This repository provides a tiny "recipe book" CLI that recommends balanced meals based on what's left in your fridge. Each recipe tracks approximate macro nutrients so the tool only surfaces meals that stay close to a 40/30/30 carb-protein-fat split.

## Requirements

- Python 3.9+ (only standard library modules are used)
- A modern browser if you want to use the new web front-end

## Web App

```bash
# Serve the repo (includes /web assets and /data/recipes.json)
npm run dev
```

Open [http://localhost:5173/web/](http://localhost:5173/web/) and paste the ingredients you have on hand. The page fetches `data/recipes.json`, applies the same scoring engine as the CLI, and renders the top matches with macro data, steps, and optional “missing ingredient” hints.

## CLI Usage

```bash
# Provide the ingredients you still have (quotes help with multi-word items)
python3 balanced_recipe_book.py "chicken breast, spinach, yogurt, lemon, tortillas"

# Ask for more than one suggestion and list missing items
python3 balanced_recipe_book.py "tofu, broccoli, rice, soy sauce" --top 3 --show-missing

# Let the script prompt you interactively
python3 balanced_recipe_book.py --interactive
```

The script reads recipes from `data/recipes.json`, filters out anything that doesn’t meet the balance target, then scores the rest by how many of your ingredients overlap with each recipe.

## Customizing Recipes

- Edit `data/recipes.json` to add or tweak meals. Keep the `macros` section accurate so the balance calculation remains meaningful.
- You can point to another collection via `--recipes path/to/other.json`.
- Ingredient names are normalized (case folded, punctuation removed) and matched using token overlap, so `"sea salt"` will also match `"salt"`.
