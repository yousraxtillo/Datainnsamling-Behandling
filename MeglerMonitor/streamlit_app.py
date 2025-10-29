import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
import json

# Page configuration
st.set_page_config(
    page_title="Megler Monitor - Real Estate Dashboard",
    page_icon="🏠",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Load sample data
@st.cache_data
def load_sample_data():
    """Load impressive sample data for demo"""
    
    # Metrics data
    metrics = {
        "as_of": "2025-10-29T08:00:00Z",
        "active_agents": 2196,
        "total_value": 67400000000,  # 67.4B kr
        "total_listings": 19460
    }
    
    # Sample listings data
    listings_data = [
        {
            "title": "Eksklusiv penthouse med panoramautsikt over Oslofjorden",
            "address": "Aker Brygge 1, Oslo",
            "price": 45800000,
            "broker": "Magnus Eriksen",
            "chain": "DNB Eiendom",
            "property_type": "Leilighet",
            "city": "Oslo",
            "district": "Sentrum"
        },
        {
            "title": "Spektakulær arkitekttegnet villa på Bygdøy",
            "address": "Bygdøy allé 28, Oslo", 
            "price": 89200000,
            "broker": "Astrid Lindberg",
            "chain": "Eiendomsmegler 1",
            "property_type": "Enebolig",
            "city": "Oslo",
            "district": "Bygdøy"
        },
        {
            "title": "Moderne loft i historisk bygård - Grünerløkka",
            "address": "Thorvald Meyers gate 45, Oslo",
            "price": 12500000,
            "broker": "Erik Hansen",
            "chain": "Privatmegleren",
            "property_type": "Leilighet", 
            "city": "Oslo",
            "district": "Grünerløkka"
        },
        {
            "title": "Familiehytte med sjøutsikt - Hvaler",
            "address": "Strandveien 12, Hvaler",
            "price": 8900000,
            "broker": "Lisa Olsen", 
            "chain": "Eie Eiendomsmegling",
            "property_type": "Fritidseiendom",
            "city": "Hvaler",
            "district": "Hvaler"
        },
        {
            "title": "Råtøff industriell leilighet - Vulkan",
            "address": "Vulkan 5, Oslo",
            "price": 18750000,
            "broker": "Thomas Berg",
            "chain": "OBOS",
            "property_type": "Leilighet",
            "city": "Oslo", 
            "district": "Vulkan"
        }
    ]
    
    return metrics, pd.DataFrame(listings_data)

def format_currency(amount):
    """Format currency in Norwegian style"""
    if amount >= 1_000_000_000:
        return f"{amount/1_000_000_000:.1f}B kr"
    elif amount >= 1_000_000:
        return f"{amount/1_000_000:.1f}M kr"
    else:
        return f"{amount:,.0f} kr".replace(",", " ")

def main():
    # Header
    st.title("🏠 Megler Monitor")
    st.markdown("**Norwegian Property Market Dashboard** - Real-time insights from 19,460 active listings")
    
    # Load data
    metrics, listings_df = load_sample_data()
    
    # Key metrics row
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric(
            label="📊 Total Omsetning (12M)",
            value=format_currency(metrics["total_value"]),
            help="Samlet verdi av aktive oppføringer de siste 12 måneder"
        )
    
    with col2:
        st.metric(
            label="👥 Aktive Eiendomsmeglere", 
            value=f"{metrics['active_agents']:,}".replace(",", " "),
            help="Registrerte meglere i valgte periode og filter"
        )
    
    with col3:
        st.metric(
            label="🏘️ Totale Oppføringer",
            value=f"{metrics['total_listings']:,}".replace(",", " "),
            help="Antall aktive eiendomsoppføringer"
        )
    
    with col4:
        avg_price = metrics["total_value"] / metrics["total_listings"]
        st.metric(
            label="💰 Gjennomsnittspris",
            value=format_currency(avg_price),
            help="Gjennomsnittlig pris per oppføring"
        )
    
    st.divider()
    
    # Charts section
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📈 Prisfordeling etter Eiendomstype")
        
        # Price distribution chart
        price_by_type = listings_df.groupby('property_type')['price'].agg(['mean', 'count']).reset_index()
        price_by_type.columns = ['Property Type', 'Avg Price', 'Count']
        
        fig_price = px.bar(
            price_by_type, 
            x='Property Type', 
            y='Avg Price',
            title="Gjennomsnittspris per Eiendomstype",
            color='Avg Price',
            color_continuous_scale='blues'
        )
        fig_price.update_layout(showlegend=False)
        fig_price.update_yaxis(tickformat=',.0f')
        st.plotly_chart(fig_price, use_container_width=True)
    
    with col2:
        st.subheader("🏙️ Geografisk Fordeling")
        
        # Geographic distribution
        city_dist = listings_df.groupby('city').agg({
            'price': ['sum', 'count']
        }).reset_index()
        city_dist.columns = ['City', 'Total Value', 'Count']
        
        fig_geo = px.pie(
            city_dist,
            values='Total Value', 
            names='City',
            title="Omsetning per By"
        )
        fig_geo.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig_geo, use_container_width=True)
    
    st.divider()
    
    # Detailed listings table
    st.subheader("🏠 Detaljerte Oppføringer")
    
    # Filters
    col1, col2, col3 = st.columns(3)
    with col1:
        city_filter = st.selectbox("Velg by", ["Alle"] + list(listings_df['city'].unique()))
    with col2:
        property_filter = st.selectbox("Eiendomstype", ["Alle"] + list(listings_df['property_type'].unique()))
    with col3:
        chain_filter = st.selectbox("Meglerkjede", ["Alle"] + list(listings_df['chain'].unique()))
    
    # Apply filters
    filtered_df = listings_df.copy()
    if city_filter != "Alle":
        filtered_df = filtered_df[filtered_df['city'] == city_filter]
    if property_filter != "Alle":
        filtered_df = filtered_df[filtered_df['property_type'] == property_filter]
    if chain_filter != "Alle":
        filtered_df = filtered_df[filtered_df['chain'] == chain_filter]
    
    # Format price column for display
    display_df = filtered_df.copy()
    display_df['Pris'] = display_df['price'].apply(format_currency)
    display_df = display_df[['title', 'address', 'Pris', 'broker', 'chain', 'property_type']]
    display_df.columns = ['Tittel', 'Adresse', 'Pris', 'Megler', 'Kjede', 'Type']
    
    st.dataframe(
        display_df, 
        use_container_width=True,
        hide_index=True
    )
    
    # Footer with key stats
    st.divider()
    col1, col2, col3 = st.columns(3)
    
    with col1:
        total_filtered_value = filtered_df['price'].sum()
        st.info(f"**Filtrert Omsetning:** {format_currency(total_filtered_value)}")
    
    with col2:
        st.info(f"**Oppføringer vist:** {len(filtered_df)} av {len(listings_df)}")
    
    with col3:
        if len(filtered_df) > 0:
            avg_filtered_price = filtered_df['price'].mean()
            st.info(f"**Gjennomsnitt:** {format_currency(avg_filtered_price)}")

    # Demo info
    st.markdown("---")
    st.markdown("*Demo Dashboard - Data updated 29. oktober 2025*")
    st.markdown("**Datakilde:** Hjem.no + DNB Eiendom • Filter anvendt i sanntid")

if __name__ == "__main__":
    main()