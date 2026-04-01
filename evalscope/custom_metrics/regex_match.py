"""Regex pattern matching metric for EvalScope."""

import re

from evalscope.metrics.metric import Metric, register_metric


@register_metric(name="regex_match")
class RegexMatch(Metric):
    """Score 1.0 if the model output matches the given regex pattern, else 0.0.

    Pass ``pattern`` via ``extra_params`` in ``dataset_args``.
    Optionally pass ``flags`` (e.g. ``"IGNORECASE"``) and
    ``match_mode`` (``"search"`` or ``"fullmatch"``; default ``"search"``).
    """

    def apply(self, predictions, references, **kwargs):
        pattern = kwargs.get("pattern", "")
        match_mode = kwargs.get("match_mode", "search")
        flags = 0
        if kwargs.get("flags"):
            for f in str(kwargs["flags"]).split("|"):
                flags |= getattr(re, f.strip(), 0)

        compiled = re.compile(pattern, flags)
        matcher = compiled.fullmatch if match_mode == "fullmatch" else compiled.search

        scores = []
        for pred in predictions:
            scores.append(1.0 if matcher(str(pred)) else 0.0)
        return scores
