#![no_main]
#![no_std]

use alloc::string::String;
use pvm::storage::Mapping;
use pvm_contract as pvm;

#[allow(unreachable_code)]
fn revert(msg: &[u8]) -> ! {
    pvm::api::return_value(pvm_contract::ReturnFlags::REVERT, msg);
    loop {}
}

#[pvm::storage]
struct Storage {
    player_count: u64,
    player_at: Mapping<u64, [u8; 20]>,
    is_registered: Mapping<[u8; 20], bool>,
    player_cid: Mapping<[u8; 20], String>,
    player_points: Mapping<[u8; 20], i64>,
}

#[pvm::contract(cdm = "@example/leaderboard")]
mod leaderboard {
    use super::*;

    #[pvm::constructor]
    pub fn new() -> Result<(), Error> {
        Storage::player_count().set(&0);
        Ok(())
    }

    #[pvm::method]
    pub fn register() -> u64 {
        let caller = *pvm::caller().as_fixed_bytes();

        if Storage::is_registered().get(&caller).unwrap_or(false) {
            revert(b"AlreadyRegistered");
        }

        let idx = Storage::player_count().get().unwrap_or(0);
        Storage::player_at().insert(&idx, &caller);
        Storage::is_registered().insert(&caller, &true);
        Storage::player_points().insert(&caller, &0);
        Storage::player_count().set(&(idx + 1));

        idx
    }

    #[pvm::method]
    pub fn update_result(new_cid: String, points_delta: i64) {
        let caller = *pvm::caller().as_fixed_bytes();

        if !Storage::is_registered().get(&caller).unwrap_or(false) {
            revert(b"NotRegistered");
        }

        Storage::player_cid().insert(&caller, &new_cid);

        let current = Storage::player_points().get(&caller).unwrap_or(0);
        Storage::player_points().insert(&caller, &(current + points_delta));
    }

    #[pvm::method]
    pub fn get_player_count() -> u64 {
        Storage::player_count().get().unwrap_or(0)
    }

    #[pvm::method]
    pub fn get_player_at(index: u64) -> [u8; 20] {
        match Storage::player_at().get(&index) {
            Some(addr) => addr,
            None => revert(b"IndexOutOfBounds"),
        }
    }

    #[pvm::method]
    pub fn get_player_cid(player: [u8; 20]) -> String {
        match Storage::player_cid().get(&player) {
            Some(cid) => cid,
            None => String::new(),
        }
    }

    #[pvm::method]
    pub fn get_player_points(player: [u8; 20]) -> i64 {
        Storage::player_points().get(&player).unwrap_or(0)
    }

    #[pvm::method]
    pub fn is_registered(player: [u8; 20]) -> bool {
        Storage::is_registered().get(&player).unwrap_or(false)
    }
}
