from app.tools.llm_json import parse_llm_json


def test_raw_newline_inside_string_is_accepted():
    raw = '{"summary": "line one\nline two", "sections": [{"heading": "H", "content": "a\tb", "citations": [1]}]}'
    out = parse_llm_json(raw)
    assert out["sections"][0]["heading"] == "H" and "line two" in out["summary"]


def test_fences_surrounding_text_and_trailing_commas():
    raw = 'Here you go:\n```json\n{"a": [1, 2,], "b": "x",}\n```\nHope that helps'
    assert parse_llm_json(raw) == {"a": [1, 2], "b": "x"}


def test_array_mode_and_default_on_garbage():
    assert parse_llm_json('noise [{"task": 1, "status": "verified"}] noise', [], array=True)[0]["status"] == "verified"
    assert parse_llm_json("not json at all", {"x": 1}) == {"x": 1}
    assert parse_llm_json("", None) is None
