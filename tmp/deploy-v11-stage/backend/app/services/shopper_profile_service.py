import re
from collections import Counter
from typing import Optional

from app.models.schemas import ShopperProfile, ShopperProfileInput


class ShopperProfileService:
    def __init__(self) -> None:
        self.style_keywords = {
            "minimal": {"minimal", "clean", "simple", "timeless", "understated"},
            "polished": {"polished", "elevated", "sharp", "refined", "smart", "tailored"},
            "expressive": {"bold", "statement", "fashion", "expressive", "personality"},
            "relaxed": {"easy", "relaxed", "casual", "weekend", "effortless"},
            "romantic": {"soft", "romantic", "feminine", "delicate"},
            "trend-aware": {"trend", "trendy", "editorial", "fashion-forward"},
        }
        self.occasion_keywords = {
            "work": {"work", "office", "meeting", "client", "professional"},
            "dinner": {"dinner", "date", "evening", "night out", "restaurant"},
            "event": {"wedding", "party", "event", "celebration", "guest"},
            "travel": {"travel", "airport", "holiday", "vacation"},
            "weekend": {"weekend", "day out", "brunch", "errands"},
        }
        self.weather_keywords = {
            "warm": {"warm", "hot", "summer", "heat", "humid"},
            "mild": {"mild", "spring", "transitional", "layering weather"},
            "cold": {"cold", "winter", "chilly", "freezing"},
            "rainy": {"rain", "rainy", "wet", "drizzle", "showers"},
        }
        self.emotion_keywords = {
            "needs_reassurance": {"not sure", "unsure", "nervous", "anxious", "safe", "won't suit me"},
            "wants_to_impress": {"impress", "make an impression", "stand out", "special"},
            "comfort_protective": {"comfortable", "comfort", "easy", "all day", "walk", "wearable"},
            "body_conscious": {"slimmer", "sharper", "softer", "hide", "flattering", "waist"},
            "time_pressed": {"quick", "fast", "simple", "easy option", "no time"},
            "experimental": {"new style", "different", "try something", "experimental"},
        }
        self.constraint_keywords = {
            "budget-aware": {"budget", "affordable", "under", "price", "cheap"},
            "comfort-first": {"comfortable", "walking", "all day", "soft", "flat shoes"},
            "low-effort": {"easy", "simple", "minimal effort", "quick"},
            "versatile": {"versatile", "re-wear", "day to night", "multi-use"},
        }
        self.silhouette_keywords = {
            "sharper": {"sharp", "structured", "tailored"},
            "slimmer": {"slimmer", "slim", "elongate", "lengthen"},
            "softer": {"soft", "gentle", "romantic"},
            "elevated": {"elevated", "polished", "expensive", "refined"},
        }
        self.segment_keyword_map = {
            "menswear": {
                "menswear",
                "mens",
                "men",
                "men's",
                "male",
                "groom",
                "for him",
            },
            "womenswear": {
                "womenswear",
                "womens",
                "women",
                "women's",
                "female",
                "ladies",
                "for her",
            },
        }

    def build_profile(
        self,
        *,
        message: str,
        mode: str,
        detected_tags: list[str],
        recent_messages: list[dict],
        recent_events: list[dict],
        image_reference: Optional[str] = None,
        profile_inputs: Optional[ShopperProfileInput] = None,
    ) -> ShopperProfile:
        explicit_values = self._extract_profile_input_values(profile_inputs)
        customer_history = [
            row.get("message", "")
            for row in recent_messages
            if row.get("sender") == "customer"
        ]
        combined_text = " ".join(
            [
                message or "",
                image_reference or "",
                " ".join(customer_history[-4:]),
                " ".join(detected_tags or []),
                " ".join(explicit_values),
            ]
        ).lower()

        style_identity = self._match_labels(combined_text, self.style_keywords)
        occasion = self._normalize_choice(profile_inputs.occasion) if profile_inputs and profile_inputs.occasion else self._detect_occasion(combined_text, mode)
        emotional_context = self._detect_emotions(combined_text, recent_events)
        confidence_level = self._detect_confidence(combined_text, emotional_context)
        decision_style = self._detect_decision_style(combined_text, recent_events)
        experimentation = self._detect_experimentation(combined_text)
        constraints = self._match_labels(combined_text, self.constraint_keywords)
        silhouette_goals = self._match_labels(combined_text, self.silhouette_keywords)
        image_signals = self._normalize_image_signals(detected_tags)
        shopping_intent = self._shopping_intent(mode, occasion)
        weather_context = (
            self._normalize_choice(profile_inputs.weather) if profile_inputs and profile_inputs.weather else self._detect_weather(combined_text)
        )
        segment_preference = (
            self._normalize_segment(profile_inputs.segment if profile_inputs else None)
            if profile_inputs and profile_inputs.segment
            else self._detect_segment_preference(combined_text, detected_tags)
        )
        budget_context = self._normalize_choice(profile_inputs.budget) if profile_inputs and profile_inputs.budget else self._detect_budget_context(combined_text)
        color_preferences = self._normalize_preferences(profile_inputs.color_preference if profile_inputs else None)
        fit_preferences = self._normalize_preferences(profile_inputs.fit_preference if profile_inputs else None)
        priority_focus = self._normalize_choice(profile_inputs.priority) if profile_inputs and profile_inputs.priority else None
        feeling_goal = self._normalize_choice(profile_inputs.feel) if profile_inputs and profile_inputs.feel else None

        if priority_focus:
            if priority_focus in {"comfort", "easy", "budget-friendly"}:
                constraints.append(
                    {
                        "comfort": "comfort-first",
                        "easy": "low-effort",
                        "budget-friendly": "budget-aware",
                    }[priority_focus]
                )
            style_identity.append(
                {
                    "polished": "polished",
                    "bold": "expressive",
                    "premium": "polished",
                    "budget-friendly": "relaxed",
                    "easy": "relaxed",
                    "comfort": "relaxed",
                }.get(priority_focus, priority_focus)
            )

        if feeling_goal:
            style_identity.append(
                {
                    "confident": "polished",
                    "elegant": "romantic",
                    "sharp": "polished",
                    "relaxed": "relaxed",
                    "experimental": "expressive",
                    "comfortable": "relaxed",
                }.get(feeling_goal, feeling_goal)
            )

        focus_points = self._focus_points(
            segment_preference=segment_preference,
            style_identity=style_identity,
            occasion=occasion,
            weather_context=weather_context,
            budget_context=budget_context,
            emotional_context=emotional_context,
            constraints=constraints,
            silhouette_goals=silhouette_goals,
            image_signals=image_signals,
            feeling_goal=feeling_goal,
            color_preferences=color_preferences,
            fit_preferences=fit_preferences,
        )

        return ShopperProfile(
            segment_preference=segment_preference,
            style_identity=style_identity or self._fallback_style_identity(mode, detected_tags),
            shopping_intent=shopping_intent,
            emotional_context=emotional_context,
            occasion_context=occasion,
            weather_context=weather_context,
            budget_context=budget_context,
            confidence_level=confidence_level,
            decision_style=decision_style,
            experimentation_preference=experimentation,
            practical_constraints=constraints,
            silhouette_goals=silhouette_goals,
            image_signals=image_signals,
            color_preferences=color_preferences,
            fit_preferences=fit_preferences,
            priority_focus=priority_focus,
            feeling_goal=feeling_goal,
            focus_points=focus_points,
            summary=self._summary(
                segment_preference=segment_preference,
                occasion=occasion,
                weather_context=weather_context,
                budget_context=budget_context,
                style_identity=style_identity,
                emotional_context=emotional_context,
                constraints=constraints,
                feeling_goal=feeling_goal,
            ),
            tone_strategy=self._tone_strategy(
                confidence_level=confidence_level,
                decision_style=decision_style,
                emotional_context=emotional_context,
                feeling_goal=feeling_goal,
            ),
        )

    def normalize_segment(self, value: Optional[str]) -> Optional[str]:
        return self._normalize_segment(value)

    def infer_segment_from_text(
        self,
        message: str,
        detected_tags: Optional[list[str]] = None,
    ) -> Optional[str]:
        return self._detect_segment_preference(message or "", detected_tags or [])

    def infer_segment_from_visual_signals(
        self,
        *,
        detected_tags: Optional[list[str]] = None,
        vision_summary: str = "",
        image_reference: str = "",
    ) -> Optional[str]:
        context = " ".join(
            [
                vision_summary or "",
                image_reference or "",
            ]
        ).strip()
        return self._detect_segment_preference(context, detected_tags or [])

    def build_query_terms(
        self,
        *,
        message: str,
        detected_tags: list[str],
        profile: ShopperProfile,
    ) -> list[str]:
        terms = self._tokenize(message)
        terms.extend(profile.style_identity)
        terms.extend(profile.practical_constraints)
        terms.extend(profile.silhouette_goals)
        terms.extend(profile.image_signals)
        terms.extend(profile.color_preferences)
        terms.extend(profile.fit_preferences)

        if profile.occasion_context:
            terms.append(profile.occasion_context)
        if profile.weather_context:
            terms.append(profile.weather_context)
        if profile.segment_preference:
            terms.append(profile.segment_preference)
        if profile.priority_focus:
            terms.append(profile.priority_focus)
        if profile.feeling_goal:
            terms.append(profile.feeling_goal)
        if profile.budget_context:
            terms.append(profile.budget_context)

        deduped = []
        seen = set()
        for item in terms + list(detected_tags or []):
            normalized = (item or "").strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)

        return deduped

    def build_follow_up_prompts(self, profile: ShopperProfile, mode: str) -> list[str]:
        if mode == "support":
            return [
                "Track my order",
                "What is the return window?",
                "How long does shipping take to Germany?",
            ]

        prompts = []

        if profile.confidence_level == "low":
            prompts.append("Show me the safest polished option")

        if profile.decision_style == "comparative":
            prompts.append("Show me another direction to compare")

        if "budget-aware" in profile.practical_constraints:
            prompts.append("Keep it under my budget")
        elif profile.budget_context:
            prompts.append("Keep the full look inside my budget")

        if profile.occasion_context in {"dinner", "event"}:
            prompts.append("Make it feel slightly more elevated")

        if "comfort-first" in profile.practical_constraints:
            prompts.append("Make it more comfortable without losing polish")

        if not prompts:
            prompts.extend(
                [
                    "Show me a sharper version",
                    "Make this easier to wear",
                    "Give me another complete look",
                ]
            )

        return prompts[:3]

    def _match_labels(self, combined_text: str, keyword_map: dict[str, set[str]]) -> list[str]:
        labels = []
        for label, keywords in keyword_map.items():
            if any(keyword in combined_text for keyword in keywords):
                labels.append(label)
        return labels

    def _detect_occasion(self, combined_text: str, mode: str) -> Optional[str]:
        for label, keywords in self.occasion_keywords.items():
            if any(keyword in combined_text for keyword in keywords):
                return label

        if mode == "get_inspired":
            return "inspiration"
        if mode == "complete_the_look":
            return "look_completion"
        return None

    def _detect_weather(self, combined_text: str) -> Optional[str]:
        for label, keywords in self.weather_keywords.items():
            if any(keyword in combined_text for keyword in keywords):
                return label
        return None

    def _detect_emotions(self, combined_text: str, recent_events: list[dict]) -> list[str]:
        emotions = self._match_labels(combined_text, self.emotion_keywords)

        feedback_counts = Counter((row.get("event_type") or "") for row in recent_events)
        if feedback_counts.get("feedback_show_another_option"):
            emotions.append("comparison_seeking")
        if feedback_counts.get("feedback_make_more_casual"):
            emotions.append("comfort_protective")

        deduped = []
        seen = set()
        for item in emotions:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        return deduped

    def _detect_confidence(self, combined_text: str, emotional_context: list[str]) -> str:
        if "needs_reassurance" in emotional_context or "body_conscious" in emotional_context:
            return "low"
        if any(token in combined_text for token in {"bold", "statement", "fashion-forward", "confident"}):
            return "high"
        return "medium"

    def _detect_decision_style(self, combined_text: str, recent_events: list[dict]) -> str:
        if any(token in combined_text for token in {"compare", "another option", "few options", "more options"}):
            return "comparative"
        if any(token in combined_text for token in {"quick", "fast", "just give me", "simple"}):
            return "decisive"
        if any((row.get("event_type") or "") == "feedback_show_another_option" for row in recent_events):
            return "comparative"
        return "guided"

    def _detect_experimentation(self, combined_text: str) -> str:
        if any(token in combined_text for token in {"safe", "classic", "simple", "easy"}):
            return "safe"
        if any(token in combined_text for token in {"bold", "new style", "different", "statement"}):
            return "experimental"
        return "balanced"

    def _shopping_intent(self, mode: str, occasion: Optional[str]) -> str:
        if mode == "support":
            return "support_resolution"
        if mode == "get_inspired":
            return "translate_inspiration"
        if mode == "complete_the_look":
            return "finish_existing_outfit"
        if occasion:
            return f"{occasion}_styling"
        return "outfit_curation"

    def _normalize_image_signals(self, detected_tags: list[str]) -> list[str]:
        return [tag.lower().strip() for tag in detected_tags if tag]

    def _extract_profile_input_values(self, profile_inputs: Optional[ShopperProfileInput]) -> list[str]:
        if not profile_inputs:
            return []

        values = []
        for value in [
            profile_inputs.segment,
            profile_inputs.occasion,
            profile_inputs.weather,
            profile_inputs.budget,
            profile_inputs.priority,
            profile_inputs.feel,
            profile_inputs.color_preference,
            profile_inputs.fit_preference,
        ]:
            if value and str(value).strip():
                values.append(str(value).strip())
        return values

    def _normalize_segment(self, value: Optional[str]) -> Optional[str]:
        normalized = self._normalize_choice(value)
        if not normalized:
            return None
        if normalized in {"menswear", "mens", "men"}:
            return "menswear"
        if normalized in {"womenswear", "womens", "women"}:
            return "womenswear"
        return None

    def _detect_segment_preference(self, combined_text: str, detected_tags: list[str]) -> Optional[str]:
        context = " ".join([combined_text or "", " ".join(detected_tags or [])]).lower()
        normalized_context = f" {re.sub(r'[^a-z0-9]+', ' ', context).strip()} "
        mens_score = 0
        womens_score = 0

        for token in self.segment_keyword_map["menswear"]:
            normalized_token = re.sub(r"[^a-z0-9]+", " ", token.lower()).strip()
            if normalized_token and f" {normalized_token} " in normalized_context:
                mens_score += 1

        for token in self.segment_keyword_map["womenswear"]:
            normalized_token = re.sub(r"[^a-z0-9]+", " ", token.lower()).strip()
            if normalized_token and f" {normalized_token} " in normalized_context:
                womens_score += 1

        if womens_score and not mens_score:
            return "womenswear"
        if mens_score and not womens_score:
            return "menswear"
        return None

    def _normalize_choice(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return normalized or None

    def _normalize_preferences(self, value: Optional[str]) -> list[str]:
        if not value:
            return []

        parts = re.split(r"[,/]| and ", str(value).lower())
        return [item.strip() for item in parts if item.strip()]

    def _detect_budget_context(self, combined_text: str) -> Optional[str]:
        match = re.search(r"(under|below|around|about)\s+(\d+(?:\.\d+)?)", combined_text)
        if not match:
            return None
        return f"{match.group(1)} {match.group(2)}"

    def _fallback_style_identity(self, mode: str, detected_tags: list[str]) -> list[str]:
        if detected_tags:
            return [detected_tags[0].lower()]
        if mode == "support":
            return []
        return ["polished", "wearable"]

    def _focus_points(
        self,
        *,
        segment_preference: Optional[str],
        style_identity: list[str],
        occasion: Optional[str],
        weather_context: Optional[str],
        budget_context: Optional[str],
        emotional_context: list[str],
        constraints: list[str],
        silhouette_goals: list[str],
        image_signals: list[str],
        feeling_goal: Optional[str],
        color_preferences: list[str],
        fit_preferences: list[str],
    ) -> list[str]:
        candidates = []
        if segment_preference:
            candidates.append(segment_preference.replace("wear", ""))
        if occasion:
            candidates.append(occasion.replace("_", " "))
        if weather_context:
            candidates.append(f"{weather_context} weather")
        if budget_context:
            candidates.append(budget_context)
        candidates.extend(style_identity[:2])
        candidates.extend(constraints[:2])
        candidates.extend(silhouette_goals[:1])
        candidates.extend(image_signals[:1])
        candidates.extend(color_preferences[:1])
        candidates.extend(fit_preferences[:1])
        if feeling_goal:
            candidates.append(f"feel {feeling_goal}")
        if "needs_reassurance" in emotional_context:
            candidates.append("needs reassurance")

        deduped = []
        seen = set()
        for item in candidates:
            normalized = item.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(item.replace("-", " "))
        return deduped[:4]

    def _summary(
        self,
        *,
        segment_preference: Optional[str],
        occasion: Optional[str],
        weather_context: Optional[str],
        budget_context: Optional[str],
        style_identity: list[str],
        emotional_context: list[str],
        constraints: list[str],
        feeling_goal: Optional[str],
    ) -> str:
        parts = []
        if segment_preference:
            parts.append(segment_preference.replace("wear", ""))
        if occasion:
            parts.append(occasion.replace("_", " "))
        if weather_context:
            parts.append(f"{weather_context} weather")
        if budget_context:
            parts.append(budget_context)
        if style_identity:
            parts.append(style_identity[0].replace("-", " "))
        if feeling_goal:
            parts.append(f"aiming to feel {feeling_goal}")
        if "needs_reassurance" in emotional_context:
            parts.append("needs extra confidence")
        elif "wants_to_impress" in emotional_context:
            parts.append("wants to make an impression")
        if constraints:
            parts.append(constraints[0].replace("-", " "))

        if not parts:
            return "General styling support with a premium, guided tone."

        return "Optimizing for " + ", ".join(parts[:3]) + "."

    def _tone_strategy(
        self,
        *,
        confidence_level: str,
        decision_style: str,
        emotional_context: list[str],
        feeling_goal: Optional[str],
    ) -> str:
        if confidence_level == "low":
            return "Reassuring, concise, and decision-light."
        if decision_style == "decisive":
            return "Direct, efficient, and low-friction."
        if feeling_goal in {"sharp", "elegant", "confident"}:
            return "Premium, composed, and quietly confident."
        if "wants_to_impress" in emotional_context:
            return "Premium, confident, and occasion-aware."
        return "Warm, polished, and logic-led."

    def _tokenize(self, value: str) -> list[str]:
        return re.findall(r"[a-z0-9]+", (value or "").lower())
