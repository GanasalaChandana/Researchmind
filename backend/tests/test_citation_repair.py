from types import SimpleNamespace as S

from app.tools.citation_repair import repair_citations

SRC = [
    S(title="Ethics of AI Agents", summary="Responsible deployment hinges on transparency, fairness and accountability. AI automation threatens job displacement in manufacturing, transportation and customer service."),
    S(title="2026 Guide to AI Agents", summary="AI agents are emerging as autonomous systems that boost business efficiency across cybersecurity, data management, customer experience and enterprise automation. DigitalOcean Agent Droplets start at $50/month."),
    S(title="Agentic AI legal challenges", summary="Three harm categories: direct user impact, manipulative influence, cumulative harm. A triad of responsibility among users, developers and owners."),
    S(title="Ethical considerations", summary="Governance frameworks, impact assessments and human oversight prevent unintended harm."),
    S(title="Ethical challenges and governance", summary="Layered governance with human-in-the-loop approval, built-in guardrails and independent third-party audits."),
    S(title="How AI Agents Enhance Efficiency", summary="Agents offer multi-step workflow automation, improved forecasting accuracy, hyperpersonalization of customer experiences, reducing costs and unlocking new revenue streams."),
]


def test_swaps_marker_to_the_source_that_says_it():
    sec = {"content": "They enable multi-step workflow automation, improve forecasting accuracy, and provide hyper-personalized customer experiences, thereby reducing costs and unlocking new revenue streams for enterprises [2].", "citations": [2]}
    n = repair_citations([sec], SRC)
    assert n == 1
    assert "[6]" in sec["content"] and "[2]" not in sec["content"]
    assert sec["citations"] == [6]


def test_correct_citations_untouched():
    text = "Responsible deployment hinges on transparency, fairness and accountability [1]. Layered governance includes human-in-the-loop approval and independent audits [5]."
    sec = {"content": text, "citations": [1, 5]}
    assert repair_citations([sec], SRC) == 0
    assert sec["content"] == text and sec["citations"] == [1, 5]


def test_ambiguous_sentence_left_alone():
    text = "This matters a great deal for organizations everywhere [2]."
    sec = {"content": text, "citations": [2]}
    assert repair_citations([sec], SRC) == 0
    assert sec["content"] == text
