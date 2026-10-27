package com.example.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface SportComplexDao {
    @Query("SELECT * FROM sport_complexes ORDER BY rating DESC")
    fun getAllComplexes(): Flow<List<SportComplex>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertComplex(complex: SportComplex)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertComplexes(complexes: List<SportComplex>)

    @Query("SELECT * FROM sport_complexes WHERE id = :id LIMIT 1")
    suspend fun getComplexById(id: Int): SportComplex?
}

@Dao
interface MatchSessionDao {
    @Query("SELECT * FROM match_sessions ORDER BY id DESC")
    fun getAllMatchSessions(): Flow<List<MatchSession>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMatchSession(match: MatchSession)

    @Update
    suspend fun updateMatchSession(match: MatchSession)

    @Delete
    suspend fun deleteMatchSession(match: MatchSession)

    @Query("SELECT * FROM match_sessions WHERE id = :id LIMIT 1")
    suspend fun getMatchSessionById(id: Int): MatchSession?
}

@Dao
interface BookingDao {
    @Query("SELECT * FROM bookings ORDER BY timestamp DESC")
    fun getAllBookings(): Flow<List<Booking>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBooking(booking: Booking)
}

@Dao
interface UserProfileDao {
    @Query("SELECT * FROM user_profile WHERE id = 1 LIMIT 1")
    fun getUserProfile(): Flow<UserProfile?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUserProfile(profile: UserProfile)

    @Update
    suspend fun updateUserProfile(profile: UserProfile)
}
