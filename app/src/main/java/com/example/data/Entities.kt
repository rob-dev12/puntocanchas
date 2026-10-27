package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sport_complexes")
data class SportComplex(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val sportType: String, // "Fútbol", "Pádel", "Tenis"
    val location: String,
    val rating: Float,
    val pricePerHour: Double,
    val availTimesString: String // e.g. "17:00;18:00;19:00;20:00;21:00"
) {
    fun getAvailableTimes(): List<String> = availTimesString.split(";").filter { it.isNotEmpty() }
}

@Entity(tableName = "match_sessions")
data class MatchSession(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val complexId: Int,
    val complexName: String,
    val sportType: String,
    val schedule: String,
    val creatorName: String,
    val description: String,
    val slotsTotal: Int,
    val slotsTaken: Int,
    val pricePerPlayer: Double,
    val joinedPlayerNamesString: String // comma-separated
) {
    fun getJoinedPlayerNames(): List<String> = joinedPlayerNamesString.split(",").map { it.trim() }.filter { it.isNotEmpty() }
}

@Entity(tableName = "bookings")
data class Booking(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val complexName: String,
    val sportType: String,
    val schedule: String,
    val bookingType: String, // "Cancha Completa" or "Partido Exprés"
    val pricePaid: Double,
    val timestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "user_profile")
data class UserProfile(
    @PrimaryKey val id: Int = 1,
    val name: String,
    val email: String,
    val walletBalance: Double
)
