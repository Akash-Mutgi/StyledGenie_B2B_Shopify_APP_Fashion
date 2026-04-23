import re


class CatalogIntelligenceService:
    def __init__(self) -> None:
        self.bucket_keywords = {
            "tops": {
                "shirt",
                "shirts",
                "tshirt",
                "tshirts",
                "tee",
                "tees",
                "top",
                "tops",
                "hoodie",
                "hoodies",
                "sweater",
                "sweaters",
                "knit",
                "knits",
                "polo",
                "polos",
                "blouse",
                "blouses",
                "crewneck",
                "henley",
            },
            "bottoms": {
                "pant",
                "pants",
                "trouser",
                "trousers",
                "jean",
                "jeans",
                "short",
                "shorts",
                "jogger",
                "joggers",
                "sweatpant",
                "sweatpants",
                "cargo",
                "cargos",
                "chino",
                "chinos",
            },
            "footwear": {
                "shoe",
                "shoes",
                "sneaker",
                "sneakers",
                "boot",
                "boots",
                "loafer",
                "loafers",
                "heel",
                "heels",
                "sandal",
                "sandals",
                "trainer",
                "trainers",
                "slipper",
                "slippers",
            },
            "outerwear": {
                "blazer",
                "blazers",
                "jacket",
                "jackets",
                "coat",
                "coats",
                "outerwear",
                "parka",
                "parkas",
                "overshirt",
                "overshirts",
                "vest",
                "vests",
                "windbreaker",
            },
            "dresswear": {
                "dress",
                "dresses",
                "skirt",
                "skirts",
                "gown",
                "gowns",
            },
            "accessories": {
                "belt",
                "belts",
                "bag",
                "bags",
                "hat",
                "hats",
                "scarf",
                "scarves",
                "watch",
                "watches",
                "wallet",
                "wallets",
                "cap",
                "caps",
                "sock",
                "socks",
            },
        }
        self.style_keywords = {
            "casual": {"casual", "relaxed", "weekend", "everyday", "graphic"},
            "formal": {"formal", "evening", "dressy", "luxury"},
            "workwear": {"work", "workwear", "office", "smart", "tailored", "professional"},
            "activewear": {"active", "athletic", "training", "sport", "performance", "tech"},
            "smart-casual": {"smart", "polished", "clean", "refined"},
            "streetwear": {"street", "oversized", "urban"},
        }
        self.material_keywords = {
            "denim": {"denim"},
            "linen": {"linen"},
            "leather": {"leather"},
            "fleece": {"fleece"},
            "knit": {"knit", "knitted"},
            "cotton": {"cotton"},
            "wool": {"wool"},
            "silk": {"silk"},
            "twill": {"twill"},
        }
        self.fit_keywords = {
            "tailored": {"tailored"},
            "slim-fit": {"slim", "slimfit"},
            "relaxed-fit": {"relaxed"},
            "oversized": {"oversized"},
            "tapered": {"taper", "tapered"},
            "straight-leg": {"straight"},
            "wide-leg": {"wide", "wideleg"},
            "easy-fit": {"easy", "easyfit"},
            "lightweight": {"lightweight"},
            "heavyweight": {"heavyweight"},
            "stretch": {"stretch", "elastic"},
        }
        self.season_keywords = {
            "summer": {"summer", "linen", "lightweight", "shorts", "sandal"},
            "winter": {"winter", "fleece", "wool", "coat", "heavyweight", "parka"},
        }
        self.color_keywords = {
            "black": {"black"},
            "white": {"white"},
            "navy": {"navy"},
            "blue": {"blue", "denim"},
            "grey": {"grey", "gray"},
            "brown": {"brown", "coyote", "tan", "camel"},
            "green": {"green", "olive"},
            "neutral": {"neutral", "beige", "cream", "ivory", "sand", "taupe", "coyote", "tan"},
        }
        self.term_expansions = {
            "blazer": {"jacket", "tailored", "outerwear", "workwear"},
            "shirt": {"top", "tee", "tshirt", "casual", "tops"},
            "hoodie": {"sweater", "fleece", "casual", "tops"},
            "pants": {"pant", "trousers", "bottoms"},
            "trousers": {"pants", "pant", "bottoms", "tailored"},
            "jeans": {"jean", "pants", "denim", "bottoms"},
            "sneakers": {"sneaker", "shoe", "footwear", "casual"},
            "heels": {"heel", "shoe", "footwear", "formal"},
            "shoe": {"shoes", "sneaker", "heel", "footwear"},
            "linen": {"lightweight", "summer"},
            "work": {"workwear", "tailored", "smart"},
            "formal": {"tailored", "polished", "smart", "workwear"},
            "casual": {"weekend", "relaxed", "everyday"},
            "smart": {"polished", "refined", "workwear"},
        }
        self.compatibility_map = {
            "tops": ["bottoms", "outerwear", "footwear", "accessories"],
            "bottoms": ["tops", "outerwear", "footwear", "accessories"],
            "outerwear": ["tops", "bottoms", "footwear", "accessories"],
            "footwear": ["tops", "bottoms", "outerwear", "dresswear", "accessories"],
            "dresswear": ["outerwear", "footwear", "accessories"],
            "accessories": ["tops", "bottoms", "outerwear", "footwear", "dresswear"],
            "general": ["tops", "bottoms", "outerwear", "footwear", "dresswear", "accessories"],
        }
        self.noise_tags = {
            "shopify collective",
        }

    def tokenize(self, value: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", (value or "").lower()))

    def expand_terms(self, terms: list[str]) -> set[str]:
        normalized_terms = set()

        for term in terms:
            token = term.strip().lower()
            if not token:
                continue

            base_tokens = self.tokenize(token)
            if not base_tokens:
                continue

            for base in base_tokens:
                normalized_terms.add(base)
                if base.endswith("s") and len(base) > 3:
                    normalized_terms.add(base[:-1])
                else:
                    normalized_terms.add(f"{base}s")

                for expanded in self.term_expansions.get(base, set()):
                    normalized_terms.add(expanded)

        return normalized_terms

    def infer_tags(self, title: str, category: str, description: str, raw_tags: list[str]) -> list[str]:
        primary_tokens = self.tokenize(" ".join([title or "", category or "", " ".join(raw_tags or [])]))
        context_tokens = self.tokenize(description or "")
        all_tokens = primary_tokens.union(context_tokens)
        cleaned_raw_tags = self._clean_raw_tags(raw_tags or [])
        inferred_tags = set(cleaned_raw_tags)

        for bucket, keywords in self.bucket_keywords.items():
            if primary_tokens.intersection(keywords):
                inferred_tags.add(bucket)

        for tag_name, keywords in self.style_keywords.items():
            if all_tokens.intersection(keywords):
                inferred_tags.add(tag_name)

        for tag_name, keywords in self.material_keywords.items():
            if all_tokens.intersection(keywords):
                inferred_tags.add(tag_name)

        for tag_name, keywords in self.fit_keywords.items():
            if all_tokens.intersection(keywords):
                inferred_tags.add(tag_name)

        for tag_name, keywords in self.season_keywords.items():
            if all_tokens.intersection(keywords):
                inferred_tags.add(tag_name)

        for tag_name, keywords in self.color_keywords.items():
            if all_tokens.intersection(keywords):
                inferred_tags.add(tag_name)

        if any(bucket in inferred_tags for bucket in ["tops", "bottoms", "outerwear", "dresswear"]):
            inferred_tags.add("apparel")

        if "footwear" in inferred_tags:
            inferred_tags.add("shoes")

        return sorted(inferred_tags)

    def clean_match_terms(self, matched_terms: set[str]) -> list[str]:
        noise = {"tops", "bottoms", "outerwear", "footwear", "apparel", "shoes", "general"}
        cleaned = [term for term in matched_terms if term not in noise]
        return sorted(cleaned)

    def product_bucket(self, product: dict) -> str:
        category_tokens = self.tokenize(
            " ".join(
                [
                    product.get("category", ""),
                    product.get("product_type", ""),
                ]
            )
        )
        title_tokens = self.tokenize(product.get("title", ""))
        tag_tokens = self.tokenize(" ".join(product.get("tags", [])))

        for bucket, keywords in self.bucket_keywords.items():
            if category_tokens.intersection(keywords):
                return bucket

        tokens = category_tokens.union(title_tokens).union(tag_tokens)

        for bucket, keywords in self.bucket_keywords.items():
            if tokens.intersection(keywords):
                return bucket

        return "general"

    def query_bucket(self, terms: set[str]) -> str:
        for bucket, keywords in self.bucket_keywords.items():
            if terms.intersection(keywords):
                return bucket
        return "general"

    def compatible_buckets(self, query_bucket: str) -> list[str]:
        return self.compatibility_map.get(query_bucket, self.compatibility_map["general"])

    def _clean_raw_tags(self, raw_tags: list[str]) -> list[str]:
        cleaned = []

        for raw_tag in raw_tags:
            tag = (raw_tag or "").strip().lower()
            if not tag:
                continue

            if tag in self.noise_tags:
                continue

            tag_tokens = self.tokenize(tag)
            if not tag_tokens:
                continue

            useful = False
            for keyword_groups in (
                self.bucket_keywords,
                self.style_keywords,
                self.material_keywords,
                self.fit_keywords,
                self.season_keywords,
                self.color_keywords,
            ):
                if any(tag_tokens.intersection(keywords) for keywords in keyword_groups.values()):
                    useful = True
                    break

            if useful:
                cleaned.append(tag)

        return cleaned
