# styles.py

STYLE_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');

/* Apply font families globally */
html, body, [class*="css"], .stApp {
    font-family: 'Inter', sans-serif !important;
}

h1, h2, h3, h4, h5, h6 {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    color: var(--text-color) !important;
    letter-spacing: -0.025em !important;
}

/* Premium gradient title */
h1 {
    font-weight: 800 !important;
    font-size: 2.75rem !important;
    background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 1.5rem !important;
    letter-spacing: -0.035em !important;
}

h2 {
    font-size: 1.85rem !important;
    font-weight: 700 !important;
    margin-top: 2.25rem !important;
    margin-bottom: 1.25rem !important;
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    padding-bottom: 0.5rem;
    color: var(--text-color) !important;
}

h3 {
    font-size: 1.35rem !important;
    font-weight: 600 !important;
    margin-top: 1.75rem !important;
    color: var(--text-color) !important;
}

/* Adjust paragraph readability and support dark/light theme */
p, li {
    font-size: 1rem !important;
    line-height: 1.7 !important;
    color: var(--text-color) !important;
    opacity: 0.9;
}

/* Card-like expanders adapting to background theme */
div[data-testid="stExpander"] {
    background-color: var(--secondary-background-color) !important;
    border: 1px solid rgba(128, 128, 128, 0.15) !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.15) !important;
    margin-bottom: 1.25rem !important;
}

/* Styling Streamlit Tabs for premium feeling */
button[data-baseweb="tab"] {
    font-family: 'Outfit', sans-serif !important;
    font-size: 1.05rem !important;
    font-weight: 500 !important;
    color: var(--text-color) !important;
    opacity: 0.65;
    padding: 0.75rem 1rem !important;
    border-bottom: 2px solid transparent !important;
    transition: all 0.2s ease-in-out !important;
}

button[data-baseweb="tab"][aria-selected="true"] {
    color: var(--primary-color) !important;
    opacity: 1.0;
    font-weight: 600 !important;
    border-bottom: 2px solid var(--primary-color) !important;
}

button[data-baseweb="tab"]:hover {
    color: var(--primary-color) !important;
    opacity: 0.85;
}

/* Make primary buttons look stunning */
button[kind="primary"] {
    background-color: var(--primary-color) !important;
    color: white !important;
    border-radius: 8px !important;
    border: none !important;
    font-weight: 600 !important;
    padding: 0.5rem 1.25rem !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15) !important;
    transition: all 0.2s !important;
}

button[kind="primary"]:hover {
    filter: brightness(1.1);
    transform: translateY(-1px) !important;
}

/* Clean sidebar hierarchy using Streamlit variables */
section[data-testid="stSidebar"] {
    background-color: var(--secondary-background-color) !important;
    border-right: 1px solid rgba(128, 128, 128, 0.15) !important;
}

section[data-testid="stSidebar"] h1, 
section[data-testid="stSidebar"] h2, 
section[data-testid="stSidebar"] h3 {
    color: var(--text-color) !important;
}
</style>
"""
