class VisionService:
    def detect_fashion_elements(self, image_name: str) -> list[str]:
        lowered = image_name.lower()

        if "blazer" in lowered:
            return ["blazer", "tailored", "neutral"]
        if "shirt" in lowered:
            return ["shirt", "linen", "lightweight"]
        if "heel" in lowered or "shoe" in lowered:
            return ["heels", "formal", "polished"]
        if "denim" in lowered:
            return ["denim", "casual", "weekend"]

        return ["tailored", "neutral palette", "smart casual"]

