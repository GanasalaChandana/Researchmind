from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="researchmind",
    version="1.0.0",
    author="Chandana Ganasala",
    author_email="chandanacherry869@gmail.com",
    description="Python SDK for the ResearchMind AI Research Agent API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/GanasalaChandana/Researchmind",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[],  # Zero dependencies — uses only stdlib
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    keywords="ai research agent knowledge-graph multi-agent",
    project_urls={
        "Documentation": "https://researchmind-app.vercel.app",
        "Bug Reports": "https://github.com/GanasalaChandana/Researchmind/issues",
        "Source Code": "https://github.com/GanasalaChandana/Researchmind",
    },
)
