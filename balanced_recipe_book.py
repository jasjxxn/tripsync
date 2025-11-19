#!/usr/bin/env python3
"""Suggest balanced recipes that match the food in your fridge."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

CAL_FACTORS = {"carbs": 4, "protein": 4, "fat": 9}
TARGET_RATIOS = {"carbs": 0.4, "protein": 0.3, "fat": 0.3}
RATIO_TOLERANCE = 0.1


def normalize_token(value: str) -> str:
    """Normalize ingredient tokens so lookups are forgiving."""
    cleaned = "".join(ch for ch in value.lower() if ch.isalnum() or ch.isspace())
    return " ".join(cleaned.split()).strip()


def parse_ingredients(raw_inputs: Sequence[str]) -> Set[str]:
    """Turn CLI inputs (space or comma separated) into a normalized set."""
    pantry: Set[str] = set()
    for chunk in raw_inputs:
        for token in chunk.split(","):
            normalized = normalize_token(token)
            if normalized:
                pantry.add(normalized)
    return pantry


def ensure_ingredients(pantry: Set[str]) -> Set[str]:
    """Collect pantry items interactively when none were provided."""
    if pantry:
        return pantry
    try:
        raw = input("List the ingredients in your fridge (comma separated): ")
    except EOFError:  # pragma: no cover - interactive fallback.
        return pantry
    return parse_ingredients([raw])


def tokenize(phrase: str) -> Set[str]:
    return set(phrase.split())


def ingredient_matches(ingredient: str, pantry: Set[str]) -> bool:
    ingredient_tokens = tokenize(ingredient)
    if not ingredient_tokens:
        return False
    for item in pantry:
        item_tokens = tokenize(item)
        if not item_tokens:
            continue
        overlap = len(ingredient_tokens & item_tokens)
        if overlap == 0:
            continue
        coverage = overlap / min(len(ingredient_tokens), len(item_tokens))
        if coverage >= 0.6:
            return True
    return False


@dataclass(frozen=True)
class Recipe:
    name: str
    servings: int
    core_ingredients: Tuple[str, ...]
    supporting_ingredients: Tuple[str, ...]
    instructions: Tuple[str, ...]
    macros: Dict[str, float]
    tags: Tuple[str, ...]
    notes: str

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "Recipe":
        def norm_list(items: Iterable[str]) -> Tuple[str, ...]:
            normalized = [normalize_token(item) for item in items]
            return tuple(item for item in normalized if item)

        core = norm_list(data.get("core_ingredients", []))
        supporting = norm_list(data.get("supporting_ingredients", []))
        return cls(
            name=str(data["name"]),
            servings=int(data.get("servings", 1)),
            core_ingredients=core,
            supporting_ingredients=supporting,
            instructions=tuple(str(step) for step in data.get("instructions", [])),
            macros={k: float(v) for k, v in data.get("macros", {}).items()},
            tags=tuple(str(tag) for tag in data.get("tags", [])),
            notes=str(data.get("notes", "")),
        )

    def ingredient_score(self, pantry: Set[str]) -> float:
        """Weight core ingredients higher so essential items matter more."""
        if not self.core_ingredients:
            return 0.0
        core_hits = sum(
            1 for ingredient in self.core_ingredients if ingredient_matches(ingredient, pantry)
        )
        core_ratio = core_hits / len(self.core_ingredients)
        if self.supporting_ingredients:
            supporting_hits = sum(
                1
                for ingredient in self.supporting_ingredients
                if ingredient_matches(ingredient, pantry)
            )
            supporting_ratio = supporting_hits / len(self.supporting_ingredients)
        else:
            supporting_ratio = 0.0
        return (core_ratio * 0.75) + (supporting_ratio * 0.25)

    def macro_ratios(self) -> Dict[str, float]:
        """Return macro ratios based on caloric contribution."""
        calories = 0.0
        for macro, factor in CAL_FACTORS.items():
            calories += self.macros.get(macro, 0.0) * factor
        if calories <= 0:
            return {macro: 0.0 for macro in TARGET_RATIOS}
        return {
            macro: (self.macros.get(macro, 0.0) * CAL_FACTORS[macro]) / calories
            for macro in TARGET_RATIOS
        }

    def balance_score(self) -> float:
        """Score how close the recipe is to the target macro ratios."""
        ratios = self.macro_ratios()
        deltas = [
            abs(ratios.get(macro, 0.0) - TARGET_RATIOS[macro]) / RATIO_TOLERANCE
            for macro in TARGET_RATIOS
        ]
        score = 1 - (sum(deltas) / len(TARGET_RATIOS))
        return max(0.0, min(1.0, score))

    def is_balanced(self) -> bool:
        """Require each macro to sit within the tolerance window."""
        ratios = self.macro_ratios()
        return all(
            abs(ratios.get(macro, 0.0) - TARGET_RATIOS[macro]) <= RATIO_TOLERANCE
            for macro in TARGET_RATIOS
        )

    def missing(self, pantry: Set[str]) -> Tuple[List[str], List[str]]:
        """Return missing core and supporting ingredients."""
        missing_core = [
            ingredient
            for ingredient in self.core_ingredients
            if not ingredient_matches(ingredient, pantry)
        ]
        missing_support = [
            ingredient
            for ingredient in self.supporting_ingredients
            if not ingredient_matches(ingredient, pantry)
        ]
        return missing_core, missing_support


def load_recipes(path: Path) -> List[Recipe]:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return [Recipe.from_dict(entry) for entry in raw]


def score_recipes(recipes: List[Recipe], pantry: Set[str]) -> List[Tuple[float, Recipe]]:
    scored: List[Tuple[float, Recipe]] = []
    for recipe in recipes:
        if not recipe.is_balanced():
            continue
        coverage = recipe.ingredient_score(pantry)
        balance = recipe.balance_score()
        score = (coverage * 0.8) + (balance * 0.2)
        scored.append((score, recipe))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored


def format_macros(macros: Dict[str, float]) -> str:
    parts = []
    for macro in ("carbs", "protein", "fat", "fiber"):
        if macro in macros:
            parts.append(f"{macro}: {macros[macro]:.0f}g")
    return ", ".join(parts)


def describe_recipe(recipe: Recipe, pantry: Set[str], show_missing: bool) -> str:
    lines = [
        f"{recipe.name} · serves {recipe.servings}",
        f"Tags: {', '.join(recipe.tags) or 'n/a'}",
        f"Macros: {format_macros(recipe.macros)}",
        "Instructions:",
    ]
    for idx, step in enumerate(recipe.instructions, start=1):
        lines.append(f"  {idx}. {step}")
    if show_missing:
        missing_core, missing_support = recipe.missing(pantry)
        if missing_core or missing_support:
            lines.append("Missing ingredients:")
            if missing_core:
                lines.append(f"  Core: {', '.join(missing_core)}")
            if missing_support:
                lines.append(f"  Supporting: {', '.join(missing_support)}")
        else:
            lines.append("You have everything you need!")
    if recipe.notes:
        lines.append(f"Notes: {recipe.notes}")
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Suggest balanced recipes using what you already have.",
    )
    parser.add_argument(
        "ingredients",
        nargs="*",
        help="Ingredients on hand (use quotes or commas for multi-word items).",
    )
    parser.add_argument(
        "--recipes",
        default="data/recipes.json",
        help="Path to the recipe collection JSON file.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=1,
        help="How many suggestions to show (default: 1).",
    )
    parser.add_argument(
        "--show-missing",
        action="store_true",
        help="List what you still need to buy for each recipe.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Force an interactive prompt for ingredients.",
    )
    return parser


def main(argv: Sequence[str]) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    pantry = parse_ingredients(args.ingredients)
    if args.interactive or not pantry:
        pantry = ensure_ingredients(pantry)
    if not pantry:
        parser.error("No ingredients provided. Add them as arguments or via the prompt.")

    recipe_path = Path(args.recipes)
    if not recipe_path.exists():
        parser.error(f"Recipe file not found: {recipe_path}")

    recipes = load_recipes(recipe_path)
    matches = score_recipes(recipes, pantry)
    if not matches:
        print("No balanced recipes found in the collection.", file=sys.stderr)
        return 1

    limit = max(1, args.top)
    for rank, (score, recipe) in enumerate(matches[:limit], start=1):
        print(f"\n[{rank}] Score {score:.2f}")
        print(describe_recipe(recipe, pantry, args.show_missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
