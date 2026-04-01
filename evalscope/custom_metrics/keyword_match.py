"""Multi-keyword matching metric for EvalScope."""

from evalscope.metrics.metric import Metric, register_metric


@register_metric(name="keyword_match")
class KeywordMatch(Metric):
    """Score based on keyword presence in model output.

    Pass ``keywords`` (list[str]) and ``mode`` (``"and"`` | ``"or"``;
    default ``"and"``) via ``extra_params`` in ``dataset_args``.

    - ``"and"``: 1.0 only if ALL keywords are present.
    - ``"or"``: 1.0 if ANY keyword is present.

    Matching is case-insensitive by default.  Set ``case_sensitive: true``
    to disable.
    """

    def apply(self, predictions, references, **kwargs):
        keywords = kwargs.get("keywords", [])
        mode = kwargs.get("mode", "and")
        case_sensitive = kwargs.get("case_sensitive", False)

        if not keywords:
            return [0.0] * len(predictions)

        scores = []
        for pred in predictions:
            text = str(pred) if case_sensitive else str(pred).lower()
            checks = [
                (kw if case_sensitive else kw.lower()) in text
                for kw in keywords
            ]
            if mode == "or":
                scores.append(1.0 if any(checks) else 0.0)
            else:
                scores.append(1.0 if all(checks) else 0.0)
        return scores
